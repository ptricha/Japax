#!/usr/bin/env node
// Token monitor: modo "statusline" (barra con tokens y %) y modo "hook" (aviso de /compact).
// Uso: node token-monitor.js statusline | hook
const fs = require('fs');
const os = require('os');
const path = require('path');

const WARN_PCT = Number(process.env.TOKEN_WARN_PCT || 60);
const URGENT_PCT = Number(process.env.TOKEN_URGENT_PCT || 75);
const TAIL_BYTES = 256 * 1024;
const STATE_FILE = path.join(os.tmpdir(), 'claude-token-monitor-state.json');

const readStdin = () => {
  try { return JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch { return {}; }
};

const readTail = (file) => {
  const fd = fs.openSync(file, 'r');
  try {
    const { size } = fs.fstatSync(fd);
    const len = Math.min(size, TAIL_BYTES);
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, size - len);
    return buf.toString('utf8');
  } finally { fs.closeSync(fd); }
};

// Tokens de contexto = input + cache_read + cache_creation del ultimo mensaje del asistente.
const tokensFromTranscript = (file) => {
  if (!file || !fs.existsSync(file)) return 0;
  const lines = readTail(file).split('\n').filter(Boolean).reverse();
  for (const line of lines) {
    try {
      const usage = JSON.parse(line)?.message?.usage;
      if (usage) {
        return (usage.input_tokens || 0)
          + (usage.cache_read_input_tokens || 0)
          + (usage.cache_creation_input_tokens || 0);
      }
    } catch { /* linea parcial al inicio del tail */ }
  }
  return 0;
};

const windowSize = (input) => {
  const fromHost = input?.context_window?.context_window_size;
  if (fromHost) return fromHost;
  if (process.env.CLAUDE_CONTEXT_WINDOW) return Number(process.env.CLAUDE_CONTEXT_WINDOW);
  const model = `${input?.model?.id || ''} ${input?.model?.display_name || ''}`.toLowerCase();
  return /1m/.test(model) ? 1_000_000 : 200_000;
};

const measure = (input) => {
  const size = windowSize(input);
  const hostPct = input?.context_window?.used_percentage;
  const tokens = tokensFromTranscript(input?.transcript_path);
  const pct = typeof hostPct === 'number' ? hostPct : (tokens / size) * 100;
  const used = tokens || Math.round((pct / 100) * size);
  return { size, used, pct: Math.round(pct) };
};

const k = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}k` : String(n));
const color = (pct) => (pct >= URGENT_PCT ? '\x1b[31m' : pct >= WARN_PCT ? '\x1b[33m' : '\x1b[32m');

const bar = (pct) => {
  const filled = Math.max(0, Math.min(10, Math.round(pct / 10)));
  return '█'.repeat(filled) + '░'.repeat(10 - filled);
};

const RESET = '\x1b[0m';
const CYAN = '\x1b[36m';
const MAGENTA = '\x1b[35m';
const SEP = ' \x1b[90m|\x1b[0m ';

const modelName = (input) => input?.model?.display_name || input?.model?.id || '?';

// Carpeta actual (solo el nombre, "~" si es el home) para que la barra sea corta.
const location = (input) => {
  const dir = input?.workspace?.current_dir || input?.cwd || process.cwd();
  if (path.resolve(dir) === path.resolve(os.homedir())) return '~';
  return path.basename(dir) || dir;
};

const statusline = () => {
  const input = readStdin();
  const { size, used, pct } = measure(input);
  const tag = pct >= URGENT_PCT ? ' ⚠ /compact YA' : pct >= WARN_PCT ? ' → /compact' : '';
  const ctx = `${color(pct)}ctx ${bar(pct)} ${pct}% · ${k(used)}/${k(size)}${tag}${RESET}`;
  process.stdout.write(
    [`${CYAN}${modelName(input)}${RESET}`, ctx, `${MAGENTA}${location(input)}${RESET}`].join(SEP),
  );
};

const loadState = () => {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return {}; }
};

const level = (pct) => (pct >= URGENT_PCT ? 2 : pct >= WARN_PCT ? 1 : 0);

// Avisa solo al subir de nivel (o cada 5 prompts en nivel urgente) para no gastar tokens en repetir.
const hook = () => {
  const input = readStdin();
  const { pct, used, size } = measure(input);
  const sid = input.session_id || 'x';
  const state = loadState();
  const prev = state[sid] || { level: 0, prompts: 0 };
  const lvl = level(pct);
  const prompts = prev.prompts + 1;
  const shouldWarn = lvl > prev.level || (lvl === 2 && prompts % 5 === 0);
  const next = { ...state, [sid]: { level: lvl, prompts: lvl === prev.level ? prompts : 0 } };
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(next)); } catch { /* no critico */ }
  if (lvl === 0 || !shouldWarn) return;

  const msg = lvl === 2
    ? `[TOKEN-MONITOR] Contexto al ${pct}% (${k(used)}/${k(size)}). URGENTE: empieza tu respuesta avisando al usuario de que ejecute /compact AHORA (o /clear si cambia de tema). Termina primero solo lo imprescindible y se ultra conciso.`
    : `[TOKEN-MONITOR] Contexto al ${pct}% (${k(used)}/${k(size)}). Al terminar la tarea actual, recomienda en UNA linea al usuario ejecutar /compact.`;
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: msg },
  }));
};

const mode = process.argv[2];
try {
  if (mode === 'statusline') statusline();
  else if (mode === 'hook') hook();
} catch { /* nunca romper la sesion por el monitor */ }
