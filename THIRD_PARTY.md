# Third-party software and optional speech

Application source is MIT; dependency and dataset terms remain separate. The npm lockfile pins the dependency graph. Desktop packages produced by Electron include their upstream Chromium/Electron notices; preserve those notices when distributing binaries.

| Component               | Upstream / license                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------ |
| React / React DOM       | [facebook/react](https://github.com/facebook/react) · MIT                                        |
| Three.js                | [mrdoob/three.js](https://github.com/mrdoob/three.js) · MIT                                      |
| Lucide icons            | [lucide](https://github.com/lucide-icons/lucide) · ISC                                           |
| Electron                | [electron](https://github.com/electron/electron) · MIT plus bundled Chromium/third-party notices |
| Vite                    | [vite](https://github.com/vitejs/vite) · MIT                                                     |
| electron-builder        | [electron-builder](https://github.com/electron-userland/electron-builder) · MIT                  |
| DM Sans / Space Grotesk | Fontsource distributions · SIL Open Font License 1.1                                             |

Room meshes, rigs, animations and sound effects are procedural application code. Repository cover, social card and icon were polished with ImageGen using captures of that procedural game, without third-party scene artwork or user desktop screenshots. The graphics contain no source screenshot interface or private local identifiers.

## Optional local voices

Original font notices are included in [DM Sans license](docs/DM-SANS-LICENSE.md) and [Space Grotesk license](docs/SPACE-GROTESK-LICENSE.md), including desktop packages.

The source package contains no speech engine binaries or voice weights. First launch automatically downloads missing voices; `npm run voices:install` is the manual equivalent. Both download [Piper v1.2.0 / release 2023.11.14-2](https://github.com/rhasspy/piper/releases/tag/2023.11.14-2) and three English models. The engine is [MIT](https://github.com/rhasspy/piper/blob/v1.2.0/LICENSE.md); weights/datasets have independent terms.

- **Ryan (male human)**: the [model card](https://huggingface.co/rhasspy/piper-voices/blob/main/en/en_US/ryan/medium/MODEL_CARD) references the RyanSpeech dataset, licensed CC BY-NC-SA 4.0. It carries noncommercial/share-alike conditions.
- **Amy (female human)**: the [model card](https://huggingface.co/rhasspy/piper-voices/blob/main/en/en_US/amy/medium/MODEL_CARD) references [Mimic 3 voices](https://github.com/MycroftAI/mimic3-voices) for licensing and states it was fine-tuned from Lessac. Consult the upstream voice/dataset terms before redistribution.
- **Lessac (female robot)**: the [model card](https://huggingface.co/rhasspy/piper-voices/blob/main/en/en_US/lessac/medium/MODEL_CARD) references [Lessac Blizzard 2013 dataset terms](https://www.cstr.ed.ac.uk/projects/blizzard/2013/lessac_blizzard2013/license.html).

The installer preserves original model cards and engine license in the local voice cache (app data/voices by default), and records downloaded asset hashes. Those hashes verify local bytes later; they are not independent upstream signatures. The engine version is pinned; voice model URLs follow upstream main and may change. Review upstream terms rather than assuming the source MIT license covers weights or commercial redistribution. By default native desktop builds omit voices and install them on first launch. System speech is an English-only fallback when local speech cannot be installed. Bundle only appropriately licensed assets, preserving their notices.
