# Quickstart

## Install once

Use a desktop Windows, macOS, or Linux session with Node.js 22+ and npm. Get the source through Git (`git clone YOUR_REPOSITORY_URL`) or GitHub's Download ZIP, then open a terminal in the directory containing `package.json`.

```sh
node scripts/setup.mjs
npm run doctor
npm start
```

These commands work in PowerShell, Command Prompt, zsh, bash, and terminal-based AI harnesses. The setup script runs `npm ci` against the committed lockfile, verifies the Electron download, and reuses a matching completed install. Use `node scripts/setup.mjs --force` to reinstall. It installs the Electron runtime, renderer and build tools; it does not install an LLM. Prefer a short checkout path, especially on Windows. There are no hardcoded home directories or working-directory-dependent bridge paths.

## Human + live agent (recommended)

```sh
npm run live
```

Ask Codex or another terminal agent to read `AGENTS.md` and play the guard. Launch this as a persistent process; do not give the launcher a short timeout that kills the app. In the app, choose **Employee** or **Thief**, male/female appearance, and exactly one item; start the encounter. Click actions to move, speak, present a credential or interact. Saying something opens a text field. Enter sends; Shift+Enter adds a line; Escape closes it. IME composition does not accidentally submit. Both sides' speech is voiced; subtitles are absent.

The agent runs `node scripts/robot-link.mjs listen` as a managed terminal task, polls that task until a packet arrives, replies with its ID and one tool, then listens again. It must keep its harness turn open until the encounter ends or you stop play: a final chat answer disconnects the agent, and the app cannot wake it. Quiet intervals are normal. The bridge does not choose the harness's model or reasoning setting. Select those in your harness. Smaller/faster models or lower reasoning settings may reduce decision time; game animations and speech still take time. The bridge reports decision/handoff timings and uses filesystem notifications with a short polling fallback. `session` offers a persistent JSON-lines subprocess for harnesses that retain stdin. It needs no network after dependencies are installed.

## Direct local or API connection

Open **Model lab**, select **Local / API model**, choose endpoint and model, test the connection, and save. API credentials remain in memory for that app session. The protocol is tool-capable `/chat/completions` plus `/models`; a text-only endpoint, provider-native API, or provider with a different tool format needs an adapter. Use a model that can follow one tool call per turn. No particular vendor is required.

| Provider       | API base URL                | Setup                                                                                                |
| -------------- | --------------------------- | ---------------------------------------------------------------------------------------------------- |
| Ollama         | `http://localhost:11434/v1` | Install/run Ollama separately, pull a tool-capable model, click Ollama and select an installed model |
| LM Studio      | `http://localhost:1234/v1`  | Load a tool-capable model and start its local server                                                 |
| Compatible API | Your provider's base URL    | Enter its model ID and optional API key                                                              |

The app lists models from your running server; it neither downloads models nor chooses a subscription. [Ollama's API documentation](https://docs.ollama.com/api/openai-compatibility) describes its compatibility interface. [LM Studio's documentation](https://lmstudio.ai/docs/developer/openai-compat) describes its local endpoint. Other agents may use the vendor-neutral live bridge instead of a direct API.

## Secondary modes

At the bottom of setup, expand **Other ways to play**. **Play as guard** gives you the robot controls and a human AI that chooses its own item. **AI vs AI** uses two independent connections. For the human choose Scripted demo, Local / API model, or Live agent. For live human use `--actor=human` on bridge commands. A guard live agent uses the default robot channel. Pause/resume is available; long automated games pause after 100 rounds. A scripted demo is a deterministic convenience policy, not an LLM experiment.

## English speech

Missing English Piper voices install automatically on first launch. If that download fails, available English system voices can provide a fallback; the app never silently selects a non-English OS default. The following commands are available for manual installation and verification:

```sh
npm run voices:install
npm run voices:test
```

The app automatically installs a platform-specific Piper engine and Ryan/Amy/Lessac English voices if missing. A compact progress indicator shows installation, and failed downloads offer Retry. Completed assets are retained; later launches reuse the cache. The commands above are manual diagnostics/repair, not required setup. It needs `tar` (included with current Windows/macOS and commonly installed on Linux). Assets are ignored by Git and omitted from source exports. Review [voice terms](../THIRD_PARTY.md) before redistribution. Downloads live under app data/voices, shared by source and packaged installations. Existing complete development or bundled voices are reused. Supported download architectures: Windows x64 (also used under Windows ARM64 emulation); macOS x64/arm64; Linux x64/arm64. System speech remains the fallback elsewhere. `GUARD_LAB_VOICES` can point an app or packaged build at an external compatible assets directory.

## Troubleshooting

| Symptom                        | Next step                                                                                                                                                        |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node`/`npm` missing           | Install the official Node.js distribution and reopen the terminal                                                                                                |
| Electron missing               | Run `node scripts/setup.mjs`; installation must permit dependency lifecycle scripts                                                                              |
| Desktop does not open on Linux | Use a graphical session and run `npm run doctor` to identify missing system libraries. Headless tests, `npm run scenario`, and the bridge work without a display |
| Live agent waits               | Start the encounter and take a human action. Match the channel and environment variables between launcher and agent                                              |
| Stale/duplicate response       | Observe a fresh packet; use its exact ID once                                                                                                                    |
| Tool rejected                  | Read the current schema and sensors. Check range, visibility, ammo and cooldown; do not invent a successful outcome                                              |
| No speech                      | Unmute, interact once to unlock audio, then install/test local voices                                                                                            |
| Two sessions interfere         | Use a different `GUARD_LAB_DATA_DIR` for each app and its agent                                                                                                  |
| Port already used              | The source launcher automatically picks another available loopback port                                                                                          |
| API connection fails           | Verify model/server/tool support. `/models` must respond and its model ID must be saved                                                                          |

Source builds are the baseline cross-platform experience. macOS/Linux runtime testing and packaging can be run by the supplied CI matrix; platform-specific display/graphics support is still required. Nothing in this repository grants a harness permissions it does not already have.
