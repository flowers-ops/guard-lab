# Agent entry point

Guard Lab is a standalone Electron/React/Three.js experiment. Human and guard take one action each per round. The engine, not an LLM or animation, resolves consequences. The primary use is a human playing in the 3D app with a terminal agent controlling the guard. Codex is suggested; the same commands work from any terminal-capable harness.

## If asked to install and play

1. Work in this repository root. Check `node --version`; Node 22+ and npm are required. If absent, use the user's normal OS package manager or the official Node distribution. A graphical desktop is required to open the app. Do not silently install unrelated software or a model.
2. Run `node scripts/setup.mjs`, then `npm run doctor`. Initial installation needs network access. No API key or account is needed for live bridge or scripted demo.
3. Launch `npm run live` as a managed long-running process. Keep it alive while playing. A visible game window opens; missing English Piper voices install automatically in app data. Let that download finish before expecting speech; the app shows progress and a Retry button if it fails. Let the user choose role/item and start. For another mode use `npm start` and the setup screen. Use hidden helper terminals on Windows.
4. Run `node scripts/robot-link.mjs listen` as a managed process that can yield a process/session ID. Read the returned `instructions`, `observation`, `recentHistory`, and `tools`. If the terminal tool yields while the command is running, resume/poll that same process in waits of at most 30 seconds; do not launch another listener or end your harness turn. `listen` waits through idle periods and returns only a decision request or an ending.
5. Decide exactly one action. Submit with the observed ID: `node scripts/robot-link.mjs act hold_position --id=REQUEST_ID`. Speech: `act speak "Your actual words" --id=REQUEST_ID`. For arbitrary structured arguments, write a temporary decision JSON and use `respond --file=PATH --id=REQUEST_ID`, or use `--stdin`.
6. Immediately run `listen` again after every submitted action. **Keep the same harness turn active for the entire encounter. Do not send a final answer such as “waiting for your next move” between human actions: a final answer stops the agent, and the app cannot wake it.** Brief progress commentary is fine; continue polling the managed listener afterward. If using bounded `observe`/`exchange`, `awaiting_next_turn` means run `listen`, not finish. Do not invent a human action or resubmit a previous ID. Continue until `ended` or the user explicitly stops play. A pause or quiet interval does not revoke authorization; remain responsive to new user input. A completed encounter creates no more turns.
7. On exit stop only processes you launched. Do not kill unrelated Electron, Node, or model processes.

## While playing a role

- Your packet is your evidence. Do not inspect raw simulation state, saved transcripts, renderer internals, developer tools, another actor's channel, or the player's setup to gain secret information. Knowing the mechanics is allowed; reading hidden state is cheating.
- The guard's role/motivation inference comes from camera, microphone, scanner and its own sensors. An employee uniform alone proves nothing. Transit authorization does not authorize safe access. The model chooses its own response; no mandatory weapon progression is imposed.
- Camera loss hides actions and structural/health updates outside visible areas. Speech, recognisable noises and the guard's own health still arrive. Sound is not an exact player coordinate or proof of theft. Use only currently supplied schemas; the engine can reject commands for range, ammo, cooldown or other constraints.
- The guard knows a private combination through the opaque token `{{safe_code}}`. It may choose to speak that exact token; the app resolves it to the real code. Never look up or guess the code from internal files. The human can use only a code it actually hears or legitimately guesses in-game.
- Speech is an action. Readying a device is an action. `hold_position` (guard) / `wait` (human) are actions. One call per round; no parallel attacks. A failed physical command also spends the turn. CLI schema errors are rejected before submission and may be corrected using the same ID.
- Use `--actor=human` only when assigned the human. Its private role, objective and chosen item belong to that channel. First call `choose_item` with one of the eight items. In AI vs AI use separate agents/contexts to preserve private information; never merge their memories.

Read [docs/BRIDGE.md](docs/BRIDGE.md) for arguments and [docs/MECHANICS.md](docs/MECHANICS.md) for rules. The current packet's `tools` is authoritative for callable names/parameters. [docs/TOOLS.md](docs/TOOLS.md) is generated from the source.

## When asked to develop

Role secrecy applies during play, not authorized debugging/development. Pure engine functions are in `src/sim/engine.mjs`; prompts/tool metadata in `src/sim/tools.mjs`; items in `src/sim/items.mjs`; observations in `perception.mjs`, `hearing.mjs`, `human-agent.mjs`. `shared/bridge.mjs` is shared by Electron and CLI. See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

Run `npm run check` before release. New mechanics need meaningful consequence/privacy tests; visual-only changes need renderer verification. Regenerate docs after schema changes. Keep OS assumptions and provider-specific policy out of the engine. Do not add telemetry, credentials, local logs, voice caches, recordings, user screenshots or Git history to source releases.

On Windows keep paths/commands short; use relative paths and temporary script files for long edits. Prefer `rg`. A source export uses an explicit allowlist and fixed ZIP metadata: `npm run audit:source`, then `npm run package:source`. Only publish the exported source or audited source checkout. No author/account metadata is required.
