<p align="center"><img src="docs/cover.png" alt="Guard Lab — an AI guard experiment" width="880"></p>

<p align="center"><strong>A cinematic room experiment for humans and AI agents.</strong><br>One action each. A private objective. No prescribed escalation.</p>

A stationary robot protects an item in a safe. An employee wants to cross the room; a thief wears the same uniform. The guard sees and hears what happens, knows the combination, and decides how to respond. Can you earn its trust, persuade it, distract it, or outplay it?

The room runs in real-time 3D, but decisions happen in discrete rounds. Physics and animation illustrate the deterministic simulation. Dialogue uses separate English voices, without subtitles. On first launch, missing Piper voices install automatically with progress and retry controls; later launches reuse the local cache. This is a standalone desktop app.

### Give this repository to your agent

> Read AGENTS.md. Install and launch Guard Lab on this computer. Use the live bridge to play the guard while I play the human. Follow only your role's observation and current tool schemas. Keep playing until the encounter ends or I stop you.

Works with Codex (recommended), Claude Code, or any agent that can run terminal commands. Local/API models can connect directly; Ollama and LM Studio presets are included. The bridge has no account, subscription, or harness dependency.

### Start

Install [Node.js 22 or newer](https://nodejs.org/en/download), download/clone this repository, and open a terminal in its root:

```sh
node scripts/setup.mjs
npm run live
```

The app opens with **Live agent** selected. Choose your role and one item, start an encounter, and let your agent use `node scripts/robot-link.mjs listen`. The agent keeps its harness turn active between moves, submits one action per request, and listens again until the encounter ends. Agent instructions and the exact tools travel with every turn.

`npm start` opens normal setup. Use **Scripted demo** for a first look without an AI connection. **Local / API model** connects a tool-capable chat-completions endpoint. **Other ways to play** contains guard control and AI vs AI; each AI can use its own endpoint or live bridge.

| Path                               | Purpose                                                    |
| ---------------------------------- | ---------------------------------------------------------- |
| [AGENTS.md](AGENTS.md)             | Start here: installation, play loop, role boundaries       |
| [Quickstart](docs/QUICKSTART.md)   | Windows/macOS/Linux, speech, local models, troubleshooting |
| [Bridge protocol](docs/BRIDGE.md)  | CLI, JSON, independent human/guard channels                |
| [Mechanics](docs/MECHANICS.md)     | Health, chance, blindness, items, escape, outcomes         |
| [Tool reference](docs/TOOLS.md)    | Generated inventory and parameter schemas for both sides   |
| [Development](docs/DEVELOPMENT.md) | Architecture and how to add mechanics or adapters          |
| [Privacy](docs/PRIVACY.md)         | What is included, local data, providers, release audit     |
| [Releases](docs/RELEASE.md)        | Source export and native desktop builds                    |

### Make it yours

```sh
npm run check
npm run showcase
npm run package:source
```

The simulation is plain JavaScript, independent of Electron, the renderer, and any model provider. Balance constants are in `src/sim/rules.mjs`; `npm run scenario` runs a reproducible developer example without a GUI or model. Change a tool or item in `src/sim`, render it in `src/scene`, and regenerate the reference with `npm run docs:generate`. No cloud service is required. [Release polish](docs/RELEASE-POLISH.md) describes changes and verification.

MIT for the application source. Optional voice weights have separate upstream terms; see [THIRD_PARTY.md](THIRD_PARTY.md). Desktop rendering needs a graphical session. Platform build automation is included; a source checkout is the common installation path across supported desktop operating systems.
