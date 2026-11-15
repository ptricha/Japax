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

3. **DPR adaptativo en ImmersiveScene** (red de seguridad): si la escena sostiene <36 fps (media >28 ms en 60 frames) baja la resolución de render por pasos de 0.25 (0.5 si >60 ms), nunca por debajo de 1x y sin volver a subir en la sesión. Verificado: en render por software baja 2→1.75; en la RTX nunca se activa (calidad intacta).
4. **`sizes` en los logos** (Nav y home): el logo de cabecera se servía a 1920 px para pintarse a ~115 px. Home 808→646 KB (logo 108→21 KB).
5. **Cierre de bitmaps de textura tras subirlos a GPU** (`lib/sceneKit.ts`, `releaseTextureBitmaps`): memoria privada total del navegador en la vista ISS ~3000 MB → ~2590 MB (-14 %). Solo se cierra cuando todas las texturas que comparten esa fuente ya se subieron. Render idéntico, sin errores en las 6 escenas.
6. **La escena 3D solo se construye cuando el canvas está a <400 px del viewport** (IntersectionObserver). Una escena bajo el pliegue ya no bloquea la carga inicial.
7. **Generación de terreno troceada** (`makeTerrain` async con cesión de hilo cada 12 ms; textura de relieve 512x512 también) y bucle de cráteres sin `Math.hypot` (distancia² + descarte). Mismos cálculos, terreno idéntico.
8. **`renderer.compileAsync`** antes del primer frame (compilación de shaders en paralelo, no bloquea).

## Resultado final (Edge + RTX 5060, build de producción)
| Escena | carga antes → ahora | descarga | draws/frame |
|---|---|---|---|
| Earth | 2053 → 1551 ms | – | 31 |
| Whole Earth | 3057 → 3052 ms | – | 19 |
| ISS interior | 1570 → 1536 ms | – | 93 |
| ISS estación completa | 4457 → 4171 ms | 13.1 MB | 112 |
| Base lunar | 2325 → 1556 ms | – | 337 |
| Traje | 1983 → 1560 ms | 3.16 → 2.35 MB | 53 |
- Descarga total recorriendo todo: 19.7 → 17.8 MB. Home: 808 → 646 KB.
- Memoria privada del navegador en vista ISS: ~3000 → ~2590 MB.
- Lighthouse móvil `/simulator`: score 72 → ~79, TBT 1740 → ~850-1050 ms (varía por ejecución). Resto de rutas: 99-100.
- Verificado tras cada cambio: type-check OK, `test:lab` 76/76, build OK, sin errores de página en las 6 escenas, capturas sin diferencia visual.

## Pendiente / ideas no aplicadas (necesitan decisión o medir en móvil real)
- Base lunar 337 draws (157 de lm.glb ×2 por la pasada de sombras): fusionar mallas rompe la identificación por nombre del touch-to-burn; congelar el shadow map es arriesgado con el motor de componentes. Medir en un móvil real antes.
- ISS completo: 2.47 M triángulos / 114 texturas 1024² (~595 MB VRAM). Solo bajaría con KTX2 (descartado, ver arriba) o con menos calidad.
- Generación de terreno en Worker (requiere mover `hash`/`fbm` a un módulo sin DOM).

## Medido, sin cambios necesarios
- Rutas sin 3D no cargan three.js (~700 KB totales); code-splitting ya correcto.
- Flame3D / FlameCanvas ya se pausaban fuera de pantalla.

## Probado y DESCARTADO (no repetir)
- **KTX2/Basis en iss_hd.glb**: baja la VRAM de 689→243 MB pero los WebP originales pesan ~0.5 bpp; KTX2 sin ruido visible sube el archivo de 15 MB a 45–60 MB (ETC1S-todo 21 MB mete ruido: 21–32 dB y oscurece paneles). Contradice "no perder calidad" y empeora la descarga.
- **Re-codificar Draco** (gltf-transform draco/optimize): cambia el render (21 dB) por cuantización de vértices en superficies coplanares del ISS. **Nunca reexportar la geometría de los GLB**; editar solo a nivel binario.
- **Liberar normales/uv de la geometría tras subirla**: rompe el traje espacial (error en cada frame). `Raycaster` lee position, normal y uv en cada impacto. Nunca liberar arrays de geometría.
- Vídeos About: ya a 1.4 Mbps 1080p; poco margen sin pérdida visible.
- Caché larga de assets: ya estaba en next.config.ts.
