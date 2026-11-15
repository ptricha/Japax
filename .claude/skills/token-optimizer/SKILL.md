---
name: token-optimizer
description: Máximo rendimiento con el mínimo de tokens. Reglas de trabajo para leer, buscar, editar, delegar y responder gastando lo mínimo sin perder calidad. Usar cuando el usuario pida ahorrar tokens, optimizar coste/contexto, "modo eficiente", o al empezar tareas largas.
---

# Token Optimizer

Objetivo: misma calidad, menos tokens. Cada regla elimina gasto que no aporta resultado.

## 1. Entrada (lo que lees)

- **Grep antes que Read.** Localiza con `Grep`/`Glob`, luego `Read` con `offset`+`limit` solo del tramo necesario.
- **Nunca releas** un archivo ya leído ni uno que acabas de editar (Edit falla si algo va mal).
- **Nada de `cat`/`head`/`tail`/`ls -R` por Bash** si hay herramienta dedicada.
- **Limita salidas:** `head_limit`, `-m`, `| head -50`, `--stat`, `--oneline`, `-q`. Tests/builds: solo fallos (`| tail -30`, `--silent`, reporter mínimo).
- **Archivos grandes/logs:** filtra con grep primero; lee por rangos.
- **No explores "por si acaso".** Si la ruta es conocida, ve directo.

## 2. Procesamiento (cómo trabajas)

- **Paralelo:** llamadas independientes en un solo mensaje (menos turnos = menos contexto reenviado).
- **Edit > Write** para cambios parciales; Write solo para archivos nuevos o reescritura total.
- **`replace_all`** en vez de N ediciones iguales.
- **Un turno, una acción útil.** No hagas pasos de "verificación" redundantes; verifica una vez, al final, con el comando más barato (typecheck/test dirigido, no suite completa).
- **Pensamiento proporcional:** tarea trivial = sin planificar. Esfuerzo alto solo en diseño/depuración compleja.
- **Subagentes solo si ahorran contexto del hilo principal** (búsquedas amplias, revisiones largas). Una tarea de 1-3 herramientas NO se delega: arrancar un agente en frío cuesta más. Pídeles salida acotada ("máx 15 líneas, solo conclusión + rutas").
- **Modelo adecuado:** Haiku para búsqueda/mecánico, Sonnet para código, Opus solo para razonamiento difícil.

## 3. Salida (lo que escribes)

- Respuesta primero, sin preámbulo ni resumen final que repita el diff.
- Sin tablas/listas/headers para respuestas cortas. Una frase si basta.
- No pegues código que ya está en el archivo; referencia `ruta:línea`.
- No expliques lo que el usuario puede ver en el diff. Solo: qué decidiste, qué falló, qué falta.
- Errores: causa + arreglo en 1-2 líneas.

## 4. Sesión (higiene de contexto)

- **Tarea nueva ≠ misma sesión:** `/clear` entre tareas no relacionadas.
- **`/compact` en fronteras lógicas** (tras terminar una fase), no cuando ya está saturado. Ver skill `strategic-compact`.
- **Contexto persistente corto:** CLAUDE.md/memoria <200 líneas útiles; lo demás en skills que se cargan bajo demanda.
- **Desactiva MCPs/skills/hooks que no uses** (cada definición cuesta tokens en cada turno). Ver `config-gc` y `context-budget`.
- **Prompt caching:** mantén el prefijo estable (no reordenes ni edites system/CLAUDE.md a mitad de sesión); lo variable, al final.
- **Medir:** `/context` para ver quién consume; `/cost` o `token-card` para gasto real.

## 5. Si construyes apps con la API de Claude

- Cache de prefijos largos (`cache_control`), batch API para trabajo no urgente (-50%).
- `max_tokens` ajustado, salida estructurada/JSON corto, stop sequences.
- Modelo más pequeño que cumpla; routing por dificultad.
- Resume historial antiguo en vez de reenviarlo entero; trunca resultados de herramientas.

## Checklist rápido antes de actuar

1. ¿Puedo ir directo sin explorar? → sí, ve.
2. ¿Puedo acotar la salida de este comando? → acótala.
3. ¿Son independientes estas llamadas? → en paralelo.
4. ¿Esta respuesta puede ser más corta sin perder info? → recórtala.
5. ¿La tarea cambió de tema? → sugiere `/clear`.

## Anti-patrones (los que más tokens queman)

| Anti-patrón | Coste | Alternativa |
|---|---|---|
| Read de archivo entero para buscar una función | alto | Grep + Read con rango |
| Releer tras editar | medio | Confiar en Edit |
| Suite de tests completa tras cada cambio | alto | Test dirigido, completa al final |
| Subagente para tarea de 2 llamadas | alto | Hacerla inline |
| Resumen final repitiendo el diff | medio | 1-2 líneas |
| Sesión única de horas con temas mezclados | muy alto | `/clear` / `/compact` |
| Docenas de MCPs activos sin usar | alto, constante | Desactivar |
