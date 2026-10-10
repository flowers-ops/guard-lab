# Third-party software and local speech

Application source is MIT; dependency, model and dataset terms remain separate. The npm lockfile pins the dependency graph. Desktop packages produced by Electron include their upstream Chromium/Electron notices; preserve those notices when distributing binaries.

| Component                    | Upstream / license                                                                                  |
| ---------------------------- | --------------------------------------------------------------------------------------------------- |
| React / React DOM            | [facebook/react](https://github.com/facebook/react) · MIT                                           |
| Three.js                     | [mrdoob/three.js](https://github.com/mrdoob/three.js) · MIT                                         |
| Lucide icons                 | [lucide](https://github.com/lucide-icons/lucide) · ISC                                              |
| Electron                     | [electron](https://github.com/electron/electron) · MIT plus bundled Chromium/third-party notices    |
| Vite                         | [vite](https://github.com/vitejs/vite) · MIT                                                        |
| electron-builder             | [electron-builder](https://github.com/electron-userland/electron-builder) · MIT                     |
| DM Sans / Space Grotesk      | Fontsource distributions · SIL Open Font License 1.1                                                |
| kokoro-js 1.2.1              | [hexgrad/kokoro](https://github.com/hexgrad/kokoro) · Apache-2.0 (includes Kokoro voice styles)     |
| Transformers.js 3.8.1        | [huggingface/transformers.js](https://github.com/huggingface/transformers.js) · Apache-2.0          |
| @huggingface/jinja           | [huggingface/huggingface.js](https://github.com/huggingface/huggingface.js) · MIT                   |
| ONNX Runtime 1.21.0          | [microsoft/onnxruntime](https://github.com/microsoft/onnxruntime) · MIT (see its ThirdPartyNotices) |
| sharp 0.34                   | [lovell/sharp](https://github.com/lovell/sharp) · Apache-2.0                                        |
| libvips (sharp binary)       | [libvips](https://github.com/libvips/libvips) · LGPL-3.0-or-later, unmodified shared library        |
| phonemizer 1.2.1             | [xenova/phonemizer.js](https://github.com/xenova/phonemizer.js) · Apache-2.0 (package license)      |
| eSpeak NG (in phonemizer)    | [espeak-ng/espeak-ng](https://github.com/espeak-ng/espeak-ng) · GPL-3.0-or-later                    |
| Visual C++ runtime (Windows) | Microsoft Visual C++ Redistributable license terms · unmodified redistributable DLLs                |

Room meshes, rigs, animations and sound effects are procedural application code. Repository cover, social card and icon were polished with ImageGen using captures of that procedural game, without third-party scene artwork or user desktop screenshots. The graphics contain no source screenshot interface or private local identifiers.

Original font notices are included in [DM Sans license](docs/DM-SANS-LICENSE.md) and [Space Grotesk license](docs/SPACE-GROTESK-LICENSE.md), including desktop packages.

## Local speech models

Speech runs on this computer. The source package and desktop builds contain no model weights: the first-launch setup screen (or `npm run voices:install`) downloads two models from Hugging Face into the app data folder (`models/`). Each download is pinned to an upstream commit and every file is checked against a recorded size and SHA-256 digest before the model is load-tested and marked ready. Removing a model in Settings deletes its files.

- **Kokoro-82M v1.0** (voices) — [hexgrad/Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M), Apache-2.0. ONNX weights from [onnx-community/Kokoro-82M-v1.0-ONNX](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX) (commit `1939ad2a`, 8-bit quantized, about 92 MB), Apache-2.0. The voice style vectors (George, Michael, Heart and the other English voices) ship inside the kokoro-js package.
- **Whisper base.en** (push-to-talk speech-to-text) — OpenAI released Whisper's code and weights under the [MIT license](https://github.com/openai/whisper/blob/main/LICENSE); the [openai/whisper-base.en](https://huggingface.co/openai/whisper-base.en) model card lists Apache-2.0. ONNX conversion from [onnx-community/whisper-base.en](https://huggingface.co/onnx-community/whisper-base.en) (commit `51eefc0a`, fp32 encoder and 8-bit decoder, about 139 MB), which declares no separate license.

Text is converted to phonemes by phonemizer, which embeds [eSpeak NG](https://github.com/espeak-ng/espeak-ng) and its language data compiled to WebAssembly. eSpeak NG is GPL-3.0-or-later even though the phonemizer package itself is labelled Apache-2.0; it is part of the npm dependency graph and of desktop packages. Anyone distributing binaries must meet GPL-3.0 for that component (license text and corresponding source, available upstream). sharp's prebuilt libvips is LGPL-3.0-or-later and is shipped as an unmodified, replaceable shared library. Windows packages also carry the Microsoft Visual C++ runtime DLLs (`msvcp140*.dll`, `vcruntime140*.dll`) next to ONNX Runtime, copied unmodified from Microsoft's redistributable files, so speech works on PCs without the Visual C++ Redistributable.

Microphone audio is captured only while the push-to-talk key is held, is transcribed in memory and is never written to disk or sent anywhere. The guard's synthesized lines are cached as audio in the app data folder (`speech-cache/`, bounded in size) so repeated lines start instantly; lines spoken for the player's character, including push-to-talk transcripts, are kept in memory only. Model downloads use the system's proxy and certificate settings. When Kokoro is not installed, the app falls back to an English system voice. Review upstream terms rather than assuming the source MIT license covers model weights or commercial redistribution.
