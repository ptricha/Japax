"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLang, useT } from "@/lib/i18n";
import { useGuide } from "@/lib/guide";
import type { Lang } from "@/lib/data";

const T = {
  en: {
    ignition: "Home", spark: "Basics", chronicles: "History", worlds: "Simulator", lab: "Data Lab", vault: "Experiments", radar: "Ranking", safety: "Safety", proof: "Sources",
    main: "Main", language: "Language", guide: "Guide mode", guideOn: "Guide on", menu: "Menu",
    hints: ["Start here", "New to this? Basics", "Real fires & history", "Simulate fire anywhere", "Every NASA experiment", "Rank what matters", "What to do in a fire", "Sources & licences"],
  },
  es: {
    ignition: "Inicio", spark: "Lo básico", chronicles: "Historia", worlds: "Simulador", lab: "Laboratorio", vault: "Experimentos", radar: "Ranking", safety: "Seguridad", proof: "Fuentes",
    main: "Principal", language: "Idioma", guide: "Modo guía", guideOn: "Guía activa", menu: "Menú",
    hints: ["Empieza aquí", "¿Nuevo? Lo básico", "Incendios reales e historia", "Simula fuego en cualquier lugar", "Cada experimento NASA", "Prioriza lo importante", "Qué hacer ante un incendio", "Fuentes y licencias"],
  },
};

function Flag({ lang }: { lang: Lang }) {
  return (
    <svg viewBox="0 0 24 16" width="24" height="16" className="rounded-[3px]" aria-hidden="true">
      {lang === "es" ? (
        <>
          <rect width="24" height="16" fill="#c60b1e" />
          <rect y="4" width="24" height="8" fill="#ffc400" />
        </>
      ) : (
        <>
          <rect width="24" height="16" fill="#012169" />
          <path d="M0 0l24 16M24 0 0 16" stroke="#fff" strokeWidth="3.2" />
          <path d="M0 0l24 16M24 0 0 16" stroke="#c8102e" strokeWidth="1.2" />
          <path d="M12 0v16M0 8h24" stroke="#fff" strokeWidth="5.2" />
          <path d="M12 0v16M0 8h24" stroke="#c8102e" strokeWidth="3" />
        </>
      )}
    </svg>
  );
}

const LANGS: { code: Lang; name: string }[] = [
  { code: "en", name: "English" },
  { code: "es", name: "Español" },
];

function LangMenu({ lang, setLang, label }: { lang: Lang; setLang: (l: Lang) => void; label: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={`${label}: ${LANGS.find((l) => l.code === lang)?.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-9 w-11 items-center justify-center rounded-md border border-line-2 transition-colors hover:border-ink-2"
      >
        <Flag lang={lang} />
      </button>
      {open && (
        <ul role="menu" className="absolute left-0 top-full z-50 mt-2 min-w-36 overflow-hidden rounded-lg border border-line-2 bg-surface p-1 shadow-xl">
          {LANGS.map((l) => (
            <li key={l.code} role="none">
              <button
                role="menuitemradio"
                aria-checked={l.code === lang}
                onClick={() => {
                  setLang(l.code);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm ${l.code === lang ? "bg-surface-2 text-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink"}`}
              >
                <Flag lang={l.code} />
                {l.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function Nav() {
  const path = usePathname();
  const { lang, setLang } = useLang();
  const { on, setOn } = useGuide();
  const t = useT(T);
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  // The saved tour state is read from localStorage; show it only after mount so it matches the server HTML
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const live = mounted && on;

  // logical learning order: understand -> see -> play -> explore -> decide -> ask -> verify
  const LINKS = [
    { href: "/", label: t.ignition },
    { href: "/learn", label: t.spark },
    { href: "/history", label: t.chronicles },
    { href: "/simulator", label: t.worlds },
    { href: "/explorer", label: t.vault },
    { href: "/dashboard", label: t.radar },
    { href: "/safety", label: t.safety },
    { href: "/references", label: t.proof },
  ];
  const isActive = (h: string) => (h === "/" ? path === "/" : path.startsWith(h));

  const guideBtn = (
    <button
      onClick={() => setOn(!on)}
      aria-pressed={live}
      className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${live ? "border-accent bg-accent/25 text-ink" : "border-line-2 text-ink-2 hover:text-ink"}`}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="m15.5 8.5-2 5-5 2 2-5z" />
      </svg>
      {live ? t.guideOn : t.guide}
    </button>
  );

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
        <LangMenu lang={lang} setLang={setLang} label={t.language} />
        <Link href="/" className="flex shrink-0 items-center">
          <Image src="/brand/japax-header-logo.png" alt="JaPax" width={1624} height={455} sizes="115px" className="h-8 w-auto" priority />
        </Link>

        <nav aria-label={t.main} className="ml-auto hidden items-center gap-0.5 text-sm xl:flex">
          {LINKS.map((l, i) => (
            <Link
              key={l.href}
              href={l.href}
              title={t.hints[i]}
              aria-current={isActive(l.href) ? "page" : undefined}
              className={`whitespace-nowrap rounded-md px-2.5 py-1.5 transition-colors ${isActive(l.href) ? "bg-surface-2 text-ink" : "text-ink-2 hover:text-ink"}`}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2 xl:ml-2">
          {guideBtn}
          <button
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label={t.menu}
            className="flex h-9 w-9 items-center justify-center rounded-md border border-line-2 text-ink-2 hover:text-ink xl:hidden"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              {open ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </div>
      {open && (
        <nav aria-label={t.main} className="border-t border-line bg-bg xl:hidden">
          <ul className="mx-auto grid max-w-6xl gap-1 px-4 py-3 sm:grid-cols-2">
            {LINKS.map((l, i) => (
              <li key={l.href}>
                <Link href={l.href} aria-current={isActive(l.href) ? "page" : undefined} className={`flex items-baseline justify-between gap-3 rounded-md px-3 py-2 ${isActive(l.href) ? "bg-surface-2 text-ink" : "text-ink-2 hover:text-ink"}`}>
                  <span className="font-medium">{i + 1}. {l.label}</span>
                  <span className="text-xs text-muted">{t.hints[i]}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  );
}
