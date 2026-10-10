# 1.0.4

- Warm area lighting, softened shadows, bounded contact shadows, cream enamel and cloth sheen bring more depth to the room. Beveled floor tiles share one instanced draw. The third-person camera uses a lower viewpoint and a narrower lens.
- The uniform has a smoother silhouette and the high pigtails use three overlapping braid strands with damped follow-through. Walking includes counter-rotation and relaxed elbows. Safe/door strikes have anticipation, impact and recovery.
- The spring glove has a rounded leather shape, an instanced metal coil, bounded rebound and synchronized wind-up/retraction sounds. Robot head tilts add expression to its chosen actions. Sound effects have a limiter for stacked impacts.
- Transparent signs, sprites and effects are excluded from contact-shadow depth and do not cast solid shadow rectangles. Transient effect groups dispose their nested geometry and instance buffers.

These changes affect presentation only. The turn engine, guard prompt, tools and private sensors retain the experiment's existing rules. Renderer checks cover both appearances, movement, glove clearance, open-safe persistence, lights, blackout, the sack, projectiles, taser and explosions.

# 1.0.3

- Live Codex uses compact exchanges that return immediately when the next turn arrives, short validated reply IDs and uninterrupted background rendering. An uninterrupted six-turn benchmark reduced median reaction after startup from 10.08 to 3.98 seconds with the same model/reasoning setting. See [measurements and limits](LATENCY.md).
- Three animated dots above the robot show when it is thinking. Players can draft speech while waiting. Kokoro warms at startup when installed; confirmed long dialogue starts playing before the remaining audio finishes preparing.
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
