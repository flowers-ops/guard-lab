# 1.0.3

- Live Codex uses compact exchanges that return immediately when the next turn arrives, short validated reply IDs and uninterrupted background rendering. An uninterrupted six-turn benchmark reduced median reaction after startup from 10.08 to 3.98 seconds with the same model/reasoning setting. See [measurements and limits](LATENCY.md).
- Three animated dots above the robot show when it is thinking. Players can draft speech while waiting. Selected voices warm during setup; confirmed long dialogue starts playing before the remaining audio finishes preparing.
- Readied glove poses use stable clearance hysteresis and safe obstruction checks. Renderer checks covered 481 frames beside the safe and while walking to the exit without clipping or repeated arm oscillation.
- A short entry briefing explains the role's goal, persuasion, deception, striking the safe, consequences and one action per round. It does not modify the guard's prompt or reveal the player's intentions to it.

# 1.0.2

This patch fixes presentation and transport problems observed during play. The guard's experiment prompt and freedom to choose its actions are unchanged.

- An open safe door stays open through subsequent actions. Only the actual closed-to-open transition animates the hinge.
- Attached devices aim at the rendered human during movement and move to high ready when there is insufficient clearance. The spring glove stops at the body surface; a consumed single-use device does not remain readied.
- Male and female characters have a tailored shirt, matte trousers, connected joints, smaller face details and clearer silhouettes. The female character has two long braids tied high. Braided locks use instancing. Walking uses ankle targets with planted soles, coordinated knees, a steadier travel speed and restrained body/hair motion.
- A legacy tool-selection migration restores lockdown, which was missing from some old configurations. All 22 established guard actions remain in the catalogue; visibility, range, ammunition and cooldown still determine availability each round. Current explicit tool selections remain editable.
- `session --compact` keeps one CLI process, sends full role instructions/schemas once, and then sends current sensors and precise availability/schema changes. The full protocol and one-shot commands remain supported. Windows read-sharing failures are retried. Timing separates the wait for the agent from the file handoff; it does not promise faster model inference.

Source tests cover hinge persistence, planted feet, prop clearance along room routes, tool migration, consumed equipment, and both persistent transports. Renderer checks exercise both character variants, walking, approach to a readied glove and movement beside an open safe. These checks do not establish reaction-time guarantees for every external AI harness.
