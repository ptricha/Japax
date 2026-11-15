# PERF-LOG — optimización 3D (rama perf/optimizacion)

Regla: **no perder calidad visual**. Cada cambio se valida con render de cámara fija (PSNR contra el original) y banco de medidas en Edge/RTX con GPU real.

## Línea base (commit 617fcbf)
| Escena | draws/frame | tex GPU | descarga | carga |
|---|---|---|---|---|
| Earth | 31 | 187 MB | – | 2.1 s |
| ISS interior | 93 | 51 MB | – | 1.6 s |
| ISS estación completa | 112 | 689 MB | 13 MB | 4.5 s |
| Base lunar | 337 | 229 MB | – | 2.3 s |
| Traje | 53 | 76 MB | 3.2 MB | 2.0 s |
Descarga total recorriendo todo: 19.7 MB.

## Hecho
1. **ImmersiveScene se pausa fuera de pantalla / pestaña oculta** (IntersectionObserver + document.hidden), igual que Flame3D. Sin cambio visual.
2. **GLB sin copias de respaldo PNG/JPEG** (emu 3.3→2.4 MB, perseverance 4.8→1.9 MB, lm 0.68→0.61 MB). Se quitaron solo las copias de respaldo de texturas que ya llevan WebP; geometría Draco y píxeles WebP intactos. Verificado: render idéntico (PSNR ∞ / >78 dB). Descarga total 19.7→17.9 MB.

## Probado y DESCARTADO (no repetir)
- **KTX2/Basis en iss_hd.glb**: baja la VRAM de 689→243 MB pero los WebP originales pesan ~0.5 bpp; KTX2 sin ruido visible sube el archivo de 15 MB a 45–60 MB (ETC1S-todo 21 MB mete ruido: 21–32 dB y oscurece paneles). Contradice "no perder calidad" y empeora la descarga.
- **Re-codificar Draco** (gltf-transform draco/optimize): cambia el render (21 dB) por cuantización de vértices en superficies coplanares del ISS. **Nunca reexportar la geometría de los GLB**; editar solo a nivel binario.
- Vídeos About: ya a 1.4 Mbps 1080p; poco margen sin pérdida visible.
- Caché larga de assets: ya estaba en next.config.ts.
