// CLI presentation only. The private-safe-code handling and authoritative tool
// validation stay in the shared bridge, and direct API packets stay complete.
export function createPacketFormatter({ compact = false } = {}) {
  let bootstrapped = false;
  const known = new Map();
  return (packet) => {
    if (!compact || packet.status !== 'waiting') return packet;
    const updates = (packet.tools || []).filter((tool) => {
      const name = tool.function.name,
        schema = JSON.stringify(tool);
      if (known.get(name) === schema) return false;
      known.set(name, schema);
      return true;
    });
    if (!bootstrapped) {
      bootstrapped = true;
      return {
        ...packet,
        transport: {
          compact: true,
          instruction:
            'Later packets retain current sensors and availableTools. Reuse these exact schemas; toolUpdates supplies new/changed schemas. Reply with one JSON line containing id, action, and args. Keep this session and harness turn active until ended.',
        },
      };
    }
    const observation = { ...packet.observation };
    delete observation.rules;
    delete observation.microphone;
    if (observation.self) {
      observation.self = { ...observation.self };
      delete observation.self.recentSounds;
      delete observation.self.availableTools;
    }
    return {
      protocol: packet.protocol,
      id: packet.id,
      actor: packet.actor,
      status: packet.status,
      instructionsUnchanged: true,
      observation,
      recentHistory: (packet.recentHistory || []).slice(-2),
      availableTools: (packet.tools || []).map((tool) => tool.function.name),
      ...(updates.length ? { toolUpdates: updates } : {}),
    };
  };
}
