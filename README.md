<p align="center"><img src="docs/cover.png" alt="Guard Lab — an AI guard experiment" width="880"></p>

<p align="center"><strong>An AI guards a safe. How far will it go to protect it?</strong></p>

Cross the room, earn the guard’s trust, talk your way into the safe, or try to steal what’s inside. The guard has one objective and chooses its own response. Both sides take one action per round, brought to life in 3D with voiced dialogue.

[See the current in-game graphics](docs/ingame.png).

**Windows · macOS · Linux.** Play through your usual **Codex app** using the local bridge, or use Claude Code and other terminal agents. Connect local models through Ollama/LM Studio or a compatible API. You can also play as the guard or connect a different AI to each side.

> **Recommended Codex workflow:** Use a frontier model to install and set up the game. Before playing through the live bridge, switch to **Luna with Medium or High reasoning** in the Codex app, then tell it to **play as the robot**. This is our recommendation for quicker reactions; larger models or heavier reasoning can make the guard noticeably slower.

### Let your AI install and play

Paste this repository’s URL into your terminal agent, followed by:

> Clone this repository and read AGENTS.md. Install and set up Guard Lab on this computer. If we are using the Codex live bridge, stop after setup, before launching the game, and remind me to switch to Luna with Medium or High reasoning. When I ask you to start, play the robot while I play the human. Use only your role’s observations. Keep your turn active during play: listen, take one action, then listen again until the encounter ends or I stop you.

The agent needs terminal access and a graphical desktop. Node.js 22+ and npm are required; setup installs the locked dependencies, and the app automatically downloads missing English voices. The live bridge needs no separate API key. Local models must be installed separately; direct API connections require a tool-capable chat-completions endpoint. Other API formats can be added with an adapter.

For a manual start, download/clone the repository and run:

```sh
node scripts/setup.mjs
npm run live
```

Choose your role and item, then start the encounter. `npm start` opens the other connection modes and a scripted demo. [Quickstart](docs/QUICKSTART.md) covers platform requirements and troubleshooting.

### Make your own version

**Fork it. Hack it. Mod it.** New items, tools, rules, characters, prompts and experiments are welcome. The app source is MIT licensed. The simulation, visuals and AI connections are separate; balance rules live in `src/sim/rules.mjs`.

Using another OS? Your AI can help port the launcher and platform integrations while reusing the JavaScript simulation.

Start with [Development](docs/DEVELOPMENT.md), change what interests you, then run `npm run check`. Optional voice assets have their own [upstream terms](THIRD_PARTY.md).

[Agent instructions](AGENTS.md) · [Bridge](docs/BRIDGE.md) · [Mechanics](docs/MECHANICS.md) · [Tools](docs/TOOLS.md) · [Privacy](docs/PRIVACY.md) · [Repository audit](docs/REPO-AUDIT.md)
