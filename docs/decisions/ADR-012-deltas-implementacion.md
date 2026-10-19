# ADR-012 — Deltas de implementación respecto de los contratos canónicos de la Fase 3

**Estado:** aceptado · **Fecha:** Iteración 2 (Fase 6)
**Alcance:** toda desviación consciente entre el plan §3.3 (contratos canónicos
de la Iteración 1) y el código real de la Iteración 2, con su justificación.
Formato: desviación → motivo → coste/alternativa descartada.

## 1. `POST /vectorize`: `fragmentSvg` explícito por capa y `params` completos

- **Desviación:** el cuerpo incluye `params` (los 6 campos comunes validados
  contra `PresetRegistry`) y cada capa de `layers[]` añade `fragmentSvg`.
- **Motivo:** el ejemplo canónico omitía el fragmento, pero la respuesta SÍ
  expone `svgFragmentUrl`: el servidor necesita el fragmento para persistirlo
  bajo `svgFragmentKey`. Sin él, el servidor tendría que «parsear» el SVG
  completo por regex (acoplamiento frágil al marcado del motor). Y sin
  `params` el servidor no puede revalidar contra el esquema del preset (regla
  §4.2: nunca se confía en JSON sin validar).
- **Alternativa descartada:** trocear el SVG completo en el servidor con
  `data-layer-orden` por regex — rompería con motores futuros (vtracer-wasm)
  y con fragmentos editados.

## 2. `POST /exports`: registro MULTIPART con clave asignada por el servidor

- **Desviación:** el registro de exportación es un multipart
  (`file` + `formatId` + `manifestJson` + `checksum`); el `storageKey` del
  ejemplo canónico pasa a ser asignado por el servidor (no declarado por el
  cliente).
- **Motivo:** el catálogo §3.2 NO incluye ningún endpoint de subida de blobs
  de exportación; aceptar una clave inventada por el cliente rompería la
  invariante de rutas del `StorageAdapter` (sanitize anti-traversal, roles,
  propiedad). Un multipart atómico cierra subida+registro sin endpoint nuevo.
- **Consecuencia:** la respuesta sigue siendo `{ export: { id, downloadUrl,
  createdAt } }` (canónica); el manifest se valida con el MISMO esquema
  compartido del ExporterRegistry (client y server validan contra
  `src/lib/registries/formats/manifests.ts`).

## 3. `PATCH /projects/:id` acepta `thumbnailAssetId`

- **Desviación:** además de `thumbnailKey`, el PATCH acepta el `id` de un
  Asset propio con rol `thumbnail` y resuelve su clave en el servidor.
- **Motivo:** el cliente web nunca conoce las claves de almacenamiento (son
  un detalle del adaptador local; en S3 serían otras). Exigir `thumbnailKey`
  al cliente filtraría un detalle de infraestructura.
- **Regla:** los dos campos son excluyentes (Zod `.refine`); el uso de
  servicios sigue siendo `thumbnailKey` (compatibilidad con clientes
  internos futuros).

## 4. `POST /layers` = duplicar capa (semántica del catálogo materializada)

- **Desviación:** ninguna de fondo: el catálogo listaba el endpoint con error
  `409 maxLayers` pero sin cuerpo canónico. Se materializa como **duplicar
  capa** (clona el fragmento bajo nueva clave, `orden = máx + 1`, permite
  override de `colorHex`/`name`), pensado para «la misma forma en dos tintas».
- **Alternativa descartada:** crear capa vacía (no aporta valor en serigrafía)
  y «split por región» (requiere edición de trazados: fuera de alcance v1).

## 5. `PATCH /layers/:layerId` con `orden` ocupado ⇒ INTERCAMBIO transaccional

- **Desviación:** el PATCH de `orden` contra una casilla ocupada NO da 409:
  intercambia las posiciones de las dos capas en una transacción (ordenes
  negativos temporales, invariante `@@unique([vectorizationId, orden])`
  intacta).
- **Motivo:** el reordenamiento por arrastre del cliente se persiste como
  secuencia corta de intercambios con SOLO los endpoints del catálogo
  (§5.6: «el orden se persiste»). Sin semántica de intercambio, cada drag
  necesitaría un endpoint de reordenación masiva nuevo.
- **Determinismo:** el cliente planifica la secuencia de swaps con una
  simulación idéntica a la del servidor (`planSwapSequence`), de modo que el
  nº de PATCHes es el mínimo de desplazamientos y el resultado es exacto.

## 6. Motores: `imagetracer-js` real; `vtracer-wasm` y `u2net-onnx` bloqueados honestos

- **Desviación:** el motor de vectorización por defecto es
  `imagetracer-js` (implementación propia: cuantización por histograma,
  filtro de motas por componentes conexas, marching squares, RDP con
  esquinas protegidas, Catmull-Rom→Bézier). `vtracer-wasm` está REGISTRADO
  pero devuelve problema `configuracion` con licencia `pending-audit`
  (ADR-001). `u2net-onnx` ídem, bloqueado además por
  `NEXT_PUBLIC_BG_REMOVAL_MODEL_URL` (ADR-009). `chroma-edge` (implementación
  propia: flood-fill desde bordes con feather) es el motor de fondo real.
- **Motivo:** el entorno de esta iteración no puede descargar ni el WASM de
  vtracer ni un modelo U²-Net de 170 MB; fingir su ejecución sería
  deshonestidad epistémica. Los stubs devuelven la clase de error exacta del
  plan (§4.3: desconocido/bloqueado enumerable con detalle accionable).
- **Coste:** la fidelidad de `imagetracer-js` queda medida por el protocolo
  perceptual de `docs/fixtures/README.md` (SSIM), no por afirmación.

## 7. `png-mockup` se compone en el hilo principal; ZIP en el Worker

- **Desviación:** la composición del mockup PNG (rasterizar SVG con
  `<img>`/canvas) corre en el hilo principal con dependencias inyectadas
  (`browser-renderer.ts`); solo el ZIP corre en `export.worker`.
- **Motivo:** los Workers clásicos no tienen `DOMParser`/`Image`/`decode()`;
  rasterizar SVG en un Worker exigiría un rasterizador propio (sobreingeniería
  prohibida por la regla 13 del listón). `buildMockupManifest` es PURO y
  verificable sin navegador; el render DOM queda aislado en un módulo mínimo.

## 8. Historial: semántica local vs persistente por tipo de comando

- **Desviación/precisión:** deshacer un recolor/visibilidad/reorden/renombre
  emite el PATCH INVERSO (el servidor queda coherente). Deshacer «quitar
  fondo» restaura la máscara LOCAL (no persistida, ADR-009). Deshacer
  «vectorizar» restaura el estado local anterior (el servidor CONSERVA las
  vectorizaciones como historial versionado: la última es la que reconstruye
  `GET /api/projects/:id`).
- **Motivo:** sin `DELETE` de vectorización en el catálogo §3.2, inventar una
  baja física sería peor (pérdida del trabajo del taller con un Ctrl+Z).
- **UI:** los toasts nombran el comando deshecho/rehecho para que la semántica
  sea visible.

## 9. `POST /api/auth/logout` (nuevo) y `POST /api/auth/guest` (ADR-011)

- **Desviación:** dos rutas fuera del catálogo original.
- **Motivo:** `logout` materializa la revocación del refresh token que el plan
  §2.2 ya exige («revocación en logout/roto»); `guest` es el ADR-011.

## 10. Workers del cliente: patrón `new Worker(new URL(...))` literal

- **Precisión técnica documentada:** el bundler (Turbopack/webpack) SOLO
  empaqueta los Web Workers cuando `new URL('<literal>', import.meta.url)`
  aparece LITERAL en la llamada a `new Worker`. Un helper que devuelva la URL
  no se reescribe y el Worker falla al cargar (404) → el host degrada al hilo
  principal (el producto funciona, pero pierde el presupuesto <100 ms del
  §5.3 para el lienzo durante el cálculo). La degradación queda registrada en
  el panel de Diagnóstico como entrada `local` con la causa exacta.

## 11. `GET /api/assets/[...key]`: Bearer extendido a claves internas + `svgUrl` en la respuesta de vectorize

- **Desviación:** el Bearer de `/api/assets` también autoriza claves de
  `Vectorization.svgStorageKey` y `Layer.svgFragmentKey` (fallback cuando la
  URL firmada de 10 min ha caducado), siempre verificando propiedad del
  proyecto; y el 201 de `POST /vectorize` añade `svgUrl` firmada además de los
  campos canónicos (el ejemplo §3.3 mostraba la reconstrucción con
  `svgUrl`, coherente con GET /:id).
- **Motivo:** las URLs firmadas caducan (server.config → TTL 600 s): un
  cliente que reabre el proyecto después necesita re-descargar fragmentos con
  su sesión; exigir solo `?t=` obligaría a re-llamar GET /:id para re-firmar.
- **Propiedad:** toda clave resuelve a Asset/Vectorization/Layer → proyecto →
  `ownerId === sub`; ajeno/inexistente → mismo 404 (no se filtra existencia).

## Verificación de coherencia

Los contratos canónicos del plan §3.3 SIGUEN siendo el documento maestro: los
deltas de arriba son adiciones/precisiones con motivo y coste; el Árbitro de
la Iteración 2 los audita contra el código (no contra este texto).
