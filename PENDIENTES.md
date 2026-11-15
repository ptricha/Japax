# PENDIENTES — optimización 3D de JaPax

Rama: `perf/optimizacion`. Registro completo de lo hecho y lo descartado: [`PERF-LOG.md`](PERF-LOG.md). Herramientas de medición: [`scripts/perf/`](scripts/perf/README.md).

## Antes de la entrega / deploy

- [ ] **Probar en un móvil real** `/simulator` (sobre todo base lunar e ISS completo). Solo se midió en PC con RTX 5060.
- [ ] **Pedir a Pablo `vercel.json` y `JaPax-7-slides.pptx`**: los tiene en local y no están en el repo (no afectan al rendimiento).
- [ ] **Revisar y fusionar** la rama `perf/optimizacion` en `master` (PR) y desplegar en Vercel. No se ha hecho deploy.

## Ideas de optimización sin hacer

- [ ] **Base lunar (337 draw calls)**: `lm.glb` tiene 157 mallas dibujadas 2 veces por las sombras. Fusionar mallas rompe la identificación por nombre del touch-to-burn y del motor de componentes; congelar el shadow map es arriesgado. Hay que medirlo en móvil antes de decidir.
- [ ] **ISS completo (~595 MB de VRAM en texturas)**: solo se reduce con pérdida de calidad (KTX2 probado y descartado: el archivo pasa de 15 MB a 45-60 MB, o aparece ruido visible).
- [ ] **Terreno en un Worker**: mover hash/fbm de `makeTerrain` a un módulo sin DOM. Queda una tarea larga de ~900 ms en el primer render (three).
- [ ] **Lighthouse `/simulator`** (~79 en móvil, TBT ~850-1050 ms): el resto de rutas ya está en 99-100.

## No repetir (descartado, ver PERF-LOG.md)

- No reexportar la geometría de los GLB (Draco/gltf-transform): cambia el render del ISS. Solo edición binaria.
- No liberar normales/uv de la geometría tras subirla a GPU: rompe el traje (el Raycaster los lee).
- KTX2/Basis en `iss_hd.glb`: contradice «sin perder calidad».
