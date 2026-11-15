# Herramientas de rendimiento

Requieren `playwright` y `sharp` (no son dependencias del proyecto): `npm i --no-save playwright sharp`.

- `bench.mjs <tag> [url]` — con `npm run build && npm start` en marcha, recorre Earth / Whole Earth / ISS / Whole station / Lunar base / Spacesuit en Edge con GPU real y guarda FPS (sin vsync), draws/frame, MB de texturas subidas, MB descargados, tiempo de carga y una captura por escena en `$PERF_OUT/bench-<tag>/`.
- `psnr.mjs a.png b.png nombre` — PSNR entre dos capturas (>40 dB = indistinguible). Las escenas animadas no son comparables entre sí; usar cámara fija.
- `slim-glb.mjs in.glb out.glb` — quita las copias PNG/JPEG de respaldo de texturas que ya llevan WebP, editando el binario (no reexporta geometría Draco).

Ver `PERF-LOG.md` en la raíz para lo que se hizo y lo que se descartó.
