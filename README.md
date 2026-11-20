# Roesch TTS

Estudio de voz local para Windows. Clona una voz a partir de 15–30 segundos de audio de referencia y genera narraciones con **Qwen3-TTS 1.7B**, sin nube, sin cuentas y sin enviar tus textos ni tu voz a ningún servidor.

![Estado](https://img.shields.io/badge/Qwen3--TTS-Apache--2.0-e8a87c) ![Plataforma](https://img.shields.io/badge/Windows-10%2F11%20x64-171310)

## Características

- Clonación de voz con 15–30 s de referencia (guarda una voz entre sesiones).
- Texto de hasta **3.000 caracteres** (recomendado: 1.500).
- Motor **llama.cpp `llama-tts`** con backend **Vulkan** (GPU AMD/NVIDIA/Intel) y **CPU** de respaldo.
- Barra de progreso con velocidad real, frames generados y **tiempo estimado**.
- Presets de acabado: **Original**, **Estudio** (−17 LUFS), **Podcast** (−16 LUFS) y **Radio** (−14 LUFS).
- Reproductor con forma de onda, historial, descarga **WAV** y **MP3**.
- Guardado automático en `audios/` junto a la aplicación (o en `%APPDATA%` si la carpeta no es escribible).
- Primera ejecución: detecta hardware, descarga el modelo (~1,4 GB) con `curl` y prueba el motor automáticamente.

## Requisitos

- Windows 10/11 x64.
- 8 GB de RAM mínimo; 16 GB recomendado.
- GPU con Vulkan y ~4 GB de VRAM para el modo rápido. Sin GPU funciona en CPU.
- ~4 GB de espacio libre (aplicación + modelo + audios).
- Internet solo en la primera ejecución (descarga del modelo desde Hugging Face).

## Uso

1. Abre `Roesch TTS.exe`.
2. En el primer arranque, espera la descarga del modelo y la prueba del motor.
3. Sube o graba **15–30 segundos** de una sola voz, sin música ni ruido.
4. Escribe el guion, elige el idioma y pulsa **Generar voz** (`Ctrl+Enter`).
5. Al terminar, elige el acabado y descarga el audio en WAV o MP3.

La voz de referencia se procesa localmente: se recorta a 30 s, se eliminan silencios, se normaliza y se guarda en WAV mono a 24 kHz.

## Carpetas (modo portable)

Todo se guarda junto al ejecutable:

```
RoeschTTS/
  Roesch TTS.exe
  runtime/        Motor llama.cpp (Vulkan + CPU)
  models/         Qwen3-TTS 1.7B Q4_K_M + mmproj
  voices/         reference.wav y reference.json
  audios/         WAV originales, procesados e index.json
  logs/           engine.log
  settings.json
```

Si la carpeta no es escribible (por ejemplo, `Program Files`), la app usa `%APPDATA%\Roesch TTS`.

## Rendimiento medido

En un Ryzen 7 PRO 6850H + Radeon RX 6500M (4 GB), con Vulkan:

| Texto | Audio generado | Tiempo de generación | Factor |
|---|---|---|---|
| 825 caracteres | 44,4 s | ~35 s (+ carga) | ~1,27× tiempo real |
| 52 caracteres | 3,7 s | ~8 s (incluye carga) | ~2,2× |

La primera generación de cada sesión incluye la carga del modelo (~5 s). Los tiempos varían según el texto, el idioma y la GPU.

## Desarrollo

```bash
npm install
npm run fetch-runtime   # descarga llama.cpp b12287 (Vulkan + CPU) en runtime/
npm run dev             # app en modo desarrollo
npm run typecheck
npm run build
npm run dist            # instalador NSIS + portable en release/
npm run dist:installer  # solo el instalador
npm run dist:portable   # solo el portable de un solo archivo
```

## Distribución

`npm run dist` genera:

- `release/RoeschTTS-Setup-1.0.0.exe`: instalador NSIS por usuario, con accesos directos. El modelo se descarga en el primer arranque y los datos quedan en `%APPDATA%\Roesch TTS`.
- `release/RoeschTTS-1.0.0-portable.exe`: portable de un solo archivo (sin modelo). Guarda los datos junto al ejecutable.

El ZIP portable completo se crea con el modelo incluido:

- `RoeschTTS-Portable-1.0.0.zip`: ejecutable normal + `models/`. Funciona sin internet.
- `RoeschTTS-Portable-SAC-1.0.0.zip`: variante que arranca con el runtime oficial de Electron mediante `Roesch TTS.vbs`, pensada para equipos con **Smart App Control** activo que bloquean ejecutables nuevos sin firma. Crea accesos directos en el escritorio y el menú Inicio.

El modelo se descarga automáticamente en `models/` al arrancar por primera vez. También se puede copiar manualmente:

- `Qwen3-TTS-12Hz-1.7B-Base-Q4_K_M.gguf`
- `mmproj-Qwen3-TTS-12Hz-1.7B-Base-Q8_0.gguf`

desde [ggml-org/Qwen3-TTS-12Hz-1.7B-Base-GGUF](https://huggingface.co/ggml-org/Qwen3-TTS-12Hz-1.7B-Base-GGUF) (revisión `ca27d74bc954b73dadab5b71ca265d87fc861a7c`).

## Estructura

```
src/main/       Electron: hardware, descargas, motor, biblioteca, IPC
src/preload/    Puente seguro contextBridge
src/renderer/   React: interfaz, reproductor, DSP y MP3
src/shared/     Tipos compartidos
runtime/        Binarios de llama.cpp (no versionados)
```

## Privacidad y uso responsable

- No hay telemetría ni conexiones después de la descarga inicial.
- Usa únicamente voces propias o con consentimiento explícito. No clonar voces de terceros para suplantación, fraude o desinformación.

## Licencias

- Qwen3-TTS: © Qwen Team, Apache-2.0.
- llama.cpp: © ggml-org, MIT.
- lamejs: LGPL-3.0.
- Roesch TTS: MIT.
