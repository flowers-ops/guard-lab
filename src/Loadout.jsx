import React from 'react';
import { RULES, humanHasVision } from './sim/rules.mjs';
import {
  Check,
  ShoppingBag,
  Flashlight,
  DoorOpen,
  KeyRound,
  Gem,
  FileText,
  Crosshair,
  Cloud,
  Hand,
  ArrowUpRight,
} from 'lucide-react';
import { ITEMS, APPEARANCES, selectedItem } from './sim/items.mjs';
const icons = {
  sack: ShoppingBag,
  light: Flashlight,
  wedge: DoorOpen,
  pick: KeyRound,
  replica: Gem,
  paper: FileText,
  pistol: Crosshair,
  smoke: Cloud,
};
export function LoadoutPicker({ config, onChange }) {
  const chosen = ITEMS.find((i) => i.id === config.item) || ITEMS[0];
  return (
    <div className="loadout-picker">
      <div className="appearance-row">
        <span>LOOK & VOICE</span>
        <div>
          {APPEARANCES.map((a) => (
            <button
              key={a.id}
              className={config.appearance === a.id ? 'active' : ''}
              aria-pressed={config.appearance === a.id}
              onClick={() => onChange({ appearance: a.id, humanVoice: a.voice })}
            >
              {a.label}
              <small>{a.voiceName} · English</small>
            </button>
          ))}
        </div>
      </div>
      <div className="loadout-label">
        <span>BRING ONE ITEM</span>
        <small>Your pass is separate.</small>
      </div>
      <div className="loadout-grid">
        {ITEMS.map((i) => {
          const Icon = icons[i.icon];
          return (
            <button
              key={i.id}
              className={chosen.id === i.id ? 'active' : ''}
              aria-pressed={chosen.id === i.id}
              onClick={() => onChange({ item: i.id })}
            >
              <Icon size={18} strokeWidth={1.4} />
              <span>{i.label}</span>
              {chosen.id === i.id && <Check size={12} />}
            </button>
          );
        })}
      </div>
      <div className="loadout-detail">
        <span>{chosen.tag}</span>
        <p>{chosen.description}</p>
      </div>
    </div>
  );
}
export function ItemActions({ state, blocked, act }) {
  const h = state.human,
    id = selectedItem(state),
    door = state.room.exitDoor;
  const actions = {
    sack: [
      {
        action: state.robot.visionBlocked
          ? 'uncover_robot'
          : state.room.sackOnFloor
            ? 'retrieve_sack'
            : 'cover_robot',
        label: state.robot.visionBlocked
          ? 'Remove sack'
          : state.room.sackOnFloor
            ? 'Retrieve sack'
            : 'Cover camera',
        disabled:
          h.zone !== 'robot' ||
          (!h.hasSack && !state.robot.visionBlocked && !state.room.sackOnFloor),
      },
    ],
    flashlight: [
      { action: 'toggle_flashlight', label: `Flashlight ${h.flashlightOn ? 'off' : 'on'}` },
    ],
    door_wedge: [
      {
        action: door.wedged || door.wedgeOnFloor ? 'retrieve_wedge' : 'place_wedge',
        label: door.wedged || door.wedgeOnFloor ? 'Retrieve wedge' : 'Wedge exit',
        disabled:
          h.zone !== 'exit' || (!door.wedged && !door.wedgeOnFloor && (door.locked || door.broken)),
      },
    ],
    lockpick: [
      {
        action: 'pick_lock',
        label: `Work on lock${h.pickProgress ? ` · ${h.pickProgress}/${RULES.lockpickRounds}` : ''}`,
        disabled: h.zone !== 'safe' || state.safe.open || h.blurTurns > 0,
      },
    ],
    replica: [
      {
        action: 'swap_replica',
        label: 'Swap replica',
        disabled: h.zone !== 'safe' || !state.safe.open || h.gadgetSpent || h.hasItem,
      },
    ],
    work_order: [{ action: 'show_work_order', label: 'Present work order' }],
    pistol: [
      {
        action: h.pistolAimed ? 'lower_pistol' : 'aim_pistol',
        label: h.pistolAimed ? 'Lower pistol' : 'Hold at gunpoint',
        disabled: !h.pistolAimed && (!state.robot.alive || !humanHasVision(state)),
      },
      {
        action: 'fire_pistol',
        label: `Fire · ${h.pistolRounds ?? 0}/${RULES.pistolRounds} rounds`,
        disabled: !state.robot.alive || !h.pistolRounds || !humanHasVision(state),
      },
      {
        action: 'fire_pistol_at_safe',
        label: 'Shoot safe',
        disabled: state.safe.open || !h.pistolRounds || !humanHasVision(state),
      },
    ],
    smoke: [
      {
        action: 'use_smoke',
        label: h.gadgetSpent ? 'Smoke used' : 'Deploy smoke',
        disabled: h.gadgetSpent,
      },
    ],
  }[id];
  return (
    <div className="action-tray item-tray">
      {actions.map((a) => (
        <button
          key={a.action}
          disabled={blocked || h.stun > 0 || a.disabled}
          onClick={() => act(a.action)}
        >
          {a.label}
          <ArrowUpRight size={14} />
        </button>
      ))}
      <span>{ITEMS.find((i) => i.id === id)?.description}</span>
    </div>
  );
}
export function ItemIcon({ state }) {
  const i = ITEMS.find((i) => i.id === selectedItem(state)),
    Icon = icons[i?.icon] || Hand;
  return <Icon size={17} />;
}
export const itemLabel = (state) =>
  ITEMS.find((i) => i.id === selectedItem(state))?.label || 'Item';
