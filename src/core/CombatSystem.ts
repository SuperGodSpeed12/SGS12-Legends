export type AttackKind = "light" | "heavy" | "launcher";

export interface AttackData {
  kind: AttackKind;
  damage: number;
  startup: number;
  active: number;
  recovery: number;
  launch: boolean;
  knockback: number;
  hitStopMs: number;
  staminaCost: number;
}

export const ATTACKS: Record<number, AttackData> = {
  0: { kind: "light", damage: 18, startup: 0.04, active: 0.06, recovery: 0.12, launch: false, knockback: 120, hitStopMs: 0.04, staminaCost: 8 },
  1: { kind: "light", damage: 22, startup: 0.05, active: 0.07, recovery: 0.14, launch: false, knockback: 140, hitStopMs: 0.05, staminaCost: 10 },
  2: { kind: "heavy", damage: 40, startup: 0.08, active: 0.08, recovery: 0.22, launch: false, knockback: 260, hitStopMs: 0.08, staminaCost: 20 },
};

export const LAUNCHER_ATTACK: AttackData = {
  kind: "launcher", damage: 15, startup: 0.06, active: 0.08, recovery: 0.18,
  launch: true, knockback: 80, hitStopMs: 0.06, staminaCost: 15,
};

export const JUGGLE_CONFIG = {
  maxHits: 6,
  decayPerHit: 0.15,
};

export function juggleDamage(base: number, hitCount: number): number {
  const decay = Math.max(0, 1 - hitCount * JUGGLE_CONFIG.decayPerHit);
  return Math.round(base * decay);
}

export const COMBO_GRACE_MS = 0.25;

export const HEAT_SYSTEM = {
  max: 100,
  passiveGainPerSec: 3,
  attackGain: 5,
  overrideGainPerSec: 12,
  cooldownPerSec: 8,
  overheatDamageMul: 0.6,
  overheatIncomingMul: 1.4,
};

export const STAMINA_SYSTEM = {
  max: 100,
  regenPerSec: 25,
  dashCost: 15,
  parryMissBurnPct: 0.15,
};
