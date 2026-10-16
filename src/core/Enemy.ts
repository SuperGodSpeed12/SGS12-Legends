// ============================================================
// GL1TCH: OVERRIDE — Boss Roster + Enemy + Animation v2
// ============================================================

import { LevelData, getCollisionRects } from "./Level";
import { RenderMode, EnemyState } from "./types";
import { rectOverlap, clamp, dist, sign, approach } from "./utils";
import { juggleDamage } from "./CombatSystem";

// ---------------------------------------------------------------------------
// Animation primitives (shared)
// ---------------------------------------------------------------------------

export enum AnimPhase {
  Idle = "Idle",
  Patrol = "Patrol",
  Chase = "Chase",
  Attack = "Attack",
  Telegraph = "Telegraph",
  HitReact = "HitReact",
  Stagger = "Stagger",
  Launch = "Launch",
  Defeat = "Defeat",
  Execute = "Execute",
}

export interface CombatAnim {
  key: string;
  frames: number;
  fps: number;
  loop?: boolean;
  offset?: { x: number; y: number };
  scale?: number;
  hitFrames?: number[];
}

export interface AnimState {
  key: string;
  phase: AnimPhase;
  frame: number;
  elapsedMs: number;
  playing: boolean;
  loop: boolean;
  fps: number;
  totalFrames: number;
  offset: { x: number; y: number };
  scale: number;
  onComplete?: () => void;
}

export function createIdleAnim(key = "idle"): AnimState {
  return {
    key,
    phase: AnimPhase.Idle,
    frame: 0,
    elapsedMs: 0,
    playing: true,
    loop: true,
    fps: 8,
    totalFrames: 4,
    offset: { x: 0, y: 0 },
    scale: 1,
  };
}

export function playAnim(
  state: AnimState,
  anim: CombatAnim,
  phase: AnimPhase,
  onComplete?: () => void,
): void {
  state.key = anim.key;
  state.phase = phase;
  state.frame = 0;
  state.elapsedMs = 0;
  state.playing = true;
  state.loop = anim.loop ?? false;
  state.fps = anim.fps;
  state.totalFrames = anim.frames;
  state.offset = anim.offset ?? { x: 0, y: 0 };
  state.scale = anim.scale ?? 1;
  state.onComplete = onComplete;
}

export function updateAnim(state: AnimState, dtMs: number): boolean {
  if (!state.playing) return false;

  state.elapsedMs += dtMs;
  const frameDuration = 1000 / state.fps;
  const newFrame = Math.floor(state.elapsedMs / frameDuration);

  if (newFrame >= state.totalFrames) {
    if (state.loop) {
      state.frame = newFrame % state.totalFrames;
      state.elapsedMs = state.elapsedMs % (state.totalFrames * frameDuration);
    } else {
      state.frame = state.totalFrames - 1;
      state.playing = false;
      state.onComplete?.();
      return true;
    }
  } else {
    state.frame = newFrame;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Boss Roster
// ---------------------------------------------------------------------------

export interface BossAttack {
  id: string;
  name: string;
  damage: number;
  windupFrames: number;
  activeFrames: number;
  recoveryFrames: number;
  color: string;
  teaches: string[];
  anims: {
    telegraph: CombatAnim;
    active: CombatAnim;
    recovery: CombatAnim;
  };
}

export interface BossPhase {
  id: string;
  label: string;
  hpThresholdPct: number;
  attacks: BossAttack[];
}

export interface BossTemplate {
  id: string;
  displayName: string;
  shortLore: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  maxHealth: number;
  coreShield: number;
  phases: BossPhase[];
  weaknesses: string[];
  recommendedForms: string[];
  rewardKey: string;
  idleAnim: CombatAnim;
  defeatAnim: CombatAnim;
}

export interface BossRuntime {
  templateId: string;
  health: number;
  maxHealth: number;
  coreShield: number;
  phaseIndex: number;
  telegraphFrames: number;
  attackFrames: number;
  attackCooldown: number;
  currentAttack: BossAttack | null;
  coreOpenFrames: number;
  attackPulse: number;
  defeated: boolean;
}

const ATTACKS = {
  sweep: {
    id: "sweep",
    name: "SWEEP LASER",
    damage: 16,
    windupFrames: 24,
    activeFrames: 16,
    recoveryFrames: 32,
    color: "#ff3366",
    teaches: ["dash", "timed evade"],
    anims: {
      telegraph: { key: "boss_sweep_tele", frames: 8, fps: 20, loop: true },
      active: { key: "boss_sweep_active", frames: 6, fps: 24, hitFrames: [1, 2, 3, 4] },
      recovery: { key: "boss_sweep_rec", frames: 10, fps: 18 },
    },
  },
  spikes: {
    id: "spikes",
    name: "DATA SPIKE VOLLEY",
    damage: 8,
    windupFrames: 16,
    activeFrames: 24,
    recoveryFrames: 20,
    color: "#ffaa00",
    teaches: ["parry", "telegraph reading"],
    anims: {
      telegraph: { key: "boss_spikes_tele", frames: 6, fps: 22, loop: true },
      active: { key: "boss_spikes_active", frames: 8, fps: 26, hitFrames: [0, 2, 4, 6] },
      recovery: { key: "boss_spikes_rec", frames: 7, fps: 20 },
    },
  },
  slam: {
    id: "slam",
    name: "ANCHOR SLAM",
    damage: 24,
    windupFrames: 28,
    activeFrames: 12,
    recoveryFrames: 38,
    color: "#ff0066",
    teaches: ["jump timing", "aerial control"],
    anims: {
      telegraph: { key: "boss_slam_tele", frames: 10, fps: 18, loop: true },
      active: { key: "boss_slam_active", frames: 5, fps: 22, hitFrames: [1, 2, 3], offset: { x: 0, y: 12 } },
      recovery: { key: "boss_slam_rec", frames: 12, fps: 16 },
    },
  },
  beam: {
    id: "beam",
    name: "JUDGMENT BEAM",
    damage: 30,
    windupFrames: 42,
    activeFrames: 14,
    recoveryFrames: 50,
    color: "#ffffff",
    teaches: ["precision dodge", "form rotation"],
    anims: {
      telegraph: { key: "boss_beam_tele", frames: 14, fps: 16, loop: true, scale: 1.15 },
      active: { key: "boss_beam_active", frames: 6, fps: 28, hitFrames: [0, 1, 2, 3, 4, 5], scale: 1.3 },
      recovery: { key: "boss_beam_rec", frames: 16, fps: 14 },
    },
  },
} satisfies Record<string, BossAttack>;

export const BOSS_CATALOG: Record<string, BossTemplate> = {
  "vex-9": {
    id: "vex-9",
    displayName: "VEX-9 // SENTIENT FIREWALL",
    shortLore: "A retired security warden repurposed as sector quarantine.",
    difficulty: 2,
    maxHealth: 1200,
    coreShield: 0,
    phases: [
      { id: "vex9-p1", label: "GRID LOCKDOWN", hpThresholdPct: 50, attacks: [ATTACKS.sweep, ATTACKS.spikes] },
      { id: "vex9-p2", label: "OVERCLOCK PULSE", hpThresholdPct: 0, attacks: [ATTACKS.slam, ATTACKS.spikes] },
    ],
    weaknesses: ["electric", "dash"],
    recommendedForms: ["volt-dash", "vapor-phase"],
    rewardKey: "firewall-key",
    idleAnim: { key: "vex9_idle", frames: 6, fps: 10, loop: true },
    defeatAnim: { key: "vex9_defeat", frames: 12, fps: 14 },
  },
  "kronos-0": {
    id: "kronos-0",
    displayName: "KRONOS-0 // TIME WARDEN",
    shortLore: "A scheduler that learned to pause its prey.",
    difficulty: 3,
    maxHealth: 1800,
    coreShield: 120,
    phases: [{ id: "kronos-p1", label: "TIMEOUT LOOP", hpThresholdPct: 0, attacks: [ATTACKS.spikes, ATTACKS.slam] }],
    weaknesses: ["aether", "parry"],
    recommendedForms: ["aether-weaver"],
    rewardKey: "clock-fragment",
    idleAnim: { key: "kronos_idle", frames: 8, fps: 8, loop: true },
    defeatAnim: { key: "kronos_defeat", frames: 14, fps: 12 },
  },
  "nyxis-7": {
    id: "nyxis-7",
    displayName: "NYXIS-7 // BIO-GLITCH",
    shortLore: "A memory leak grown large enough to dream.",
    difficulty: 4,
    maxHealth: 2400,
    coreShield: 160,
    phases: [{ id: "nyxis-p1", label: "SPORE BLOOM", hpThresholdPct: 0, attacks: [ATTACKS.spikes, ATTACKS.slam] }],
    weaknesses: ["fire", "dot"],
    recommendedForms: ["corruptor", "aether-weaver"],
    rewardKey: "bio-rot-synthesizer",
    idleAnim: { key: "nyxis_idle", frames: 10, fps: 9, loop: true },
    defeatAnim: { key: "nyxis_defeat", frames: 16, fps: 12 },
  },
  "ares-7": {
    id: "ares-7",
    displayName: "OVERSEER ARES-7 // IRON JUDGE",
    shortLore: "Final authority of the network. Ares judges corrupted processes.",
    difficulty: 5,
    maxHealth: 6000,
    coreShield: 400,
    phases: [
      { id: "ares7-p1", label: "ARMORED VANGUARD", hpThresholdPct: 60, attacks: [ATTACKS.sweep, ATTACKS.slam] },
      { id: "ares7-p2", label: "GIGA-CORE MELTDOWN", hpThresholdPct: 20, attacks: [ATTACKS.sweep, ATTACKS.beam] },
    ],
    weaknesses: ["back exhaust ports", "energy drain"],
    recommendedForms: ["null-vanguard", "giga-override", "vapor-phase"],
    rewardKey: "kernel-master-key",
    idleAnim: { key: "ares_idle", frames: 8, fps: 8, loop: true },
    defeatAnim: { key: "ares_defeat", frames: 18, fps: 12, scale: 1.2 },
  },
};

export function createBossInstance(templateId: string): BossRuntime {
  const template = BOSS_CATALOG[templateId];
  if (!template) throw new Error(`Boss template not found: ${templateId}`);
  return {
    templateId,
    health: template.maxHealth,
    maxHealth: template.maxHealth,
    coreShield: template.coreShield,
    phaseIndex: 0,
    telegraphFrames: 0,
    attackFrames: 0,
    attackCooldown: 90,
    currentAttack: null,
    coreOpenFrames: 0,
    attackPulse: 0,
    defeated: false,
  };
}

export function getBossPhase(runtime: BossRuntime): BossPhase {
  const template = BOSS_CATALOG[runtime.templateId];
  const hpPct = (runtime.health / runtime.maxHealth) * 100;
  let phaseIndex = 0;
  for (let i = 0; i < template.phases.length; i++) {
    if (hpPct <= template.phases[i].hpThresholdPct) phaseIndex = i;
  }
  return template.phases[Math.max(0, Math.min(phaseIndex, template.phases.length - 1))];
}

export function damageBoss(runtime: BossRuntime, amount: number) {
  if (runtime.defeated) return { shieldBroken: false, phaseChanged: false, defeated: true };

  let remaining = amount;
  let shieldBroken = false;

  if (runtime.coreShield > 0) {
    const shieldDamage = Math.min(runtime.coreShield, amount * 0.8);
    runtime.coreShield -= shieldDamage;
    remaining = Math.max(0, amount - shieldDamage);
    if (runtime.coreShield <= 0) {
      shieldBroken = true;
      runtime.coreOpenFrames = 90;
    }
  }

  runtime.health = Math.max(0, runtime.health - remaining);

  const previousPhase = runtime.phaseIndex;
  const template = BOSS_CATALOG[runtime.templateId];
  const nextPhase = template.phases.reduce((index, phase, indexValue) => {
    return (runtime.health / runtime.maxHealth) * 100 <= phase.hpThresholdPct ? indexValue : index;
  }, 0);

  runtime.phaseIndex = Math.max(runtime.phaseIndex, nextPhase);
  runtime.defeated = runtime.health <= 0;

  return {
    shieldBroken,
    phaseChanged: previousPhase !== runtime.phaseIndex,
    defeated: runtime.defeated,
  };
}

export function updateBoss(runtime: BossRuntime, dtFrames: number) {
  if (runtime.defeated) return { telegraphStarted: false, attackStarted: false };

  runtime.attackPulse += dtFrames;
  runtime.coreOpenFrames = Math.max(0, runtime.coreOpenFrames - dtFrames);
  runtime.telegraphFrames = Math.max(0, runtime.telegraphFrames - dtFrames);
  runtime.attackFrames = Math.max(0, runtime.attackFrames - dtFrames);
  runtime.attackCooldown = Math.max(0, runtime.attackCooldown - dtFrames);

  let telegraphStarted = false;
  let attackStarted = false;

  if (runtime.telegraphFrames === 0 && runtime.attackFrames === 0 && runtime.attackCooldown === 0) {
    const phase = getBossPhase(runtime);
    runtime.currentAttack = phase.attacks[Math.floor(runtime.attackPulse / 30) % phase.attacks.length];
    runtime.telegraphFrames = runtime.currentAttack.windupFrames;
    telegraphStarted = true;
  } else if (runtime.currentAttack && runtime.telegraphFrames === 0 && runtime.attackFrames === 0) {
    runtime.attackFrames = runtime.currentAttack.activeFrames;
    runtime.attackCooldown = runtime.currentAttack.recoveryFrames;
    attackStarted = true;
  }

  return { telegraphStarted, attackStarted };
}

// ---------------------------------------------------------------------------
// Shared hit-reaction animations
// ---------------------------------------------------------------------------

export const HIT_ANIMS = {
  light: { key: "hit_light", frames: 4, fps: 20 } as CombatAnim,
  heavy: { key: "hit_heavy", frames: 6, fps: 18, offset: { x: 0, y: -6 } } as CombatAnim,
  launch: { key: "hit_launch", frames: 8, fps: 16, offset: { x: 0, y: -20 } } as CombatAnim,
  defeat: { key: "hit_defeat", frames: 10, fps: 14 } as CombatAnim,
  stagger: { key: "hit_stagger", frames: 6, fps: 12, loop: true } as CombatAnim,
};

// ---------------------------------------------------------------------------
// Enemy class (fully animated)
// ---------------------------------------------------------------------------

export type EnemyType = "walker" | "shooter" | "hazard" | "boss";

export class Enemy {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number = 0;
  vy: number = 0;
  type: EnemyType;
  hp: number;
  maxHP: number;
  damage: number;
  state: EnemyState = "patrol";
  facing: number = -1;
  staggerTime: number = 0;
  staggerThreshold: number = 50;
  staggerAccum: number = 0;
  attackCooldown: number = 0;
  hitFlash: number = 0;
  animTime: number = 0;
  alive: boolean = true;
  addressLine: number = 0;
  executable: boolean = false;
  executionTime: number = 0;

  // Animation
  anim: AnimState = createIdleAnim();

  // Juggle
  airborne: boolean = false;
  juggleHits: number = 0;
  juggleResetTimer: number = 0;

  // Boss
  isBoss: boolean = false;
  bossRuntime: BossRuntime | null = null;
  telegraphRect: { x: number; y: number; w: number; h: number } | null = null;

  // Callbacks
  onShake: (i: number, d: number) => void = () => {};
  onHitStop: (d: number) => void = () => {};
  onParticles: (x: number, y: number, count: number, color: string, speed?: number, life?: number, size?: number) => void = () => {};
  onShoot: (x: number, y: number, dx: number, dy: number, speed: number, damage: number) => void = () => {};
  onDeath: (x: number, y: number) => void = () => {};

  patrolStartX: number;
  patrolRange: number = 96;
  contactCooldown: number = 0;

  constructor(type: EnemyType, x: number, y: number, bossId?: string) {
    this.type = type;
    this.x = x;
    this.y = y;
    this.patrolStartX = x;

    if (type === "walker") {
      this.w = 28; this.h = 32;
      this.hp = 60; this.maxHP = 60;
      this.damage = 15;
      playAnim(this.anim, { key: "walker_idle", frames: 4, fps: 8, loop: true }, AnimPhase.Idle);
    } else if (type === "shooter") {
      this.w = 30; this.h = 36;
      this.hp = 40; this.maxHP = 40;
      this.damage = 10;
      playAnim(this.anim, { key: "shooter_idle", frames: 4, fps: 8, loop: true }, AnimPhase.Idle);
    } else if (type === "boss") {
      this.w = 64; this.h = 72;
      this.isBoss = true;
      this.staggerThreshold = 100;

      if (bossId && BOSS_CATALOG[bossId]) {
        this.bossRuntime = createBossInstance(bossId);
        this.hp = this.bossRuntime.health;
        this.maxHP = this.bossRuntime.maxHealth;
        this.damage = 25;
        const template = BOSS_CATALOG[bossId];
        playAnim(this.anim, template.idleAnim, AnimPhase.Idle);
      } else {
        this.hp = 400; this.maxHP = 400;
        this.damage = 25;
        playAnim(this.anim, { key: "boss_idle", frames: 6, fps: 8, loop: true }, AnimPhase.Idle);
      }
    } else {
      this.w = 32; this.h = 32;
      this.hp = 999; this.maxHP = 999;
      this.damage = 20;
      playAnim(this.anim, { key: "hazard_idle", frames: 4, fps: 10, loop: true }, AnimPhase.Idle);
    }
  }

  takeDamage(amount: number, fromX: number, launch: boolean = false): boolean {
    if (!this.alive || this.type === "hazard") return false;

    let actualDamage = amount;
    if (this.airborne) {
      actualDamage = juggleDamage(amount, this.juggleHits);
      this.juggleHits++;
      this.juggleResetTimer = 1.5;
    }

    if (this.isBoss && this.bossRuntime) {
      const result = damageBoss(this.bossRuntime, actualDamage);
      this.hp = this.bossRuntime.health;

      if (result.shieldBroken) {
        this.onShake(8, 0.25);
        this.onParticles(this.x + this.w / 2, this.y + this.h / 2, 20, "#aa00ff", 200, 0.5, 3);
      }
      if (result.phaseChanged) {
        this.onShake(12, 0.4);
      }
      if (result.defeated) {
        this.playDefeatAnim();
        this.die();
        return true;
      }
    } else {
      this.hp -= actualDamage;
    }

    this.hitFlash = 0.15;
    this.staggerAccum += actualDamage;
    this.onShake(4, 0.1);
    this.onHitStop(0.04);
    this.onParticles(this.x + this.w / 2, this.y + this.h / 2, 6, "#ffaa00", 150, 0.3, 2);

    // Animation reactions
    if (launch) {
      this.airborne = true;
      this.vy = -400;
      this.vx = -sign(fromX - this.x) * 80;
      this.juggleHits = 0;
      playAnim(this.anim, HIT_ANIMS.launch, AnimPhase.Launch);
    } else {
      this.vx = -sign(fromX - this.x) * 120;
      if (!this.airborne) this.vy = -80;
      playAnim(this.anim, HIT_ANIMS.heavy, AnimPhase.HitReact);
    }

    if (this.staggerAccum >= this.staggerThreshold && this.state !== "staggered") {
      this.state = "staggered";
      this.staggerTime = this.isBoss ? 4 : 2.5;
      this.executable = true;
      this.executionTime = this.isBoss ? 4 : 2.5;
      this.addressLine = Math.random() * Math.PI;
      this.staggerAccum = 0;

      if (this.bossRuntime) {
        this.bossRuntime.coreShield = 0;
        this.bossRuntime.coreOpenFrames = 90;
      }

      playAnim(this.anim, HIT_ANIMS.stagger, AnimPhase.Stagger);
      this.onShake(this.isBoss ? 10 : 5, this.isBoss ? 0.3 : 0.15);
    }

    if (this.hp <= 0) {
      this.playDefeatAnim();
      this.die();
      return true;
    }
    return false;
  }

  private playDefeatAnim() {
    if (this.isBoss && this.bossRuntime) {
      const template = BOSS_CATALOG[this.bossRuntime.templateId];
      playAnim(this.anim, template.defeatAnim, AnimPhase.Defeat);
    } else {
      playAnim(this.anim, HIT_ANIMS.defeat, AnimPhase.Defeat);
    }
  }

  execute() {
    if (!this.alive || !this.executable) return;
    playAnim(this.anim, { key: "execute", frames: 8, fps: 18 }, AnimPhase.Execute);
    this.onParticles(this.x + this.w / 2, this.y + this.h / 2, 30, "#00ffff", 300, 0.6, 4);
    this.onParticles(this.x + this.w / 2, this.y + this.h / 2, 15, "#ffffff", 200, 0.5, 3);
    this.onShake(8, 0.3);
    this.onHitStop(0.1);
    this.die();
    this.onDeath(this.x + this.w / 2, this.y + this.h / 2);
  }

  private die() {
    this.alive = false;
    this.state = "dead";
    if (this.bossRuntime) this.bossRuntime.defeated = true;
    this.onParticles(this.x + this.w / 2, this.y + this.h / 2, 15, "#ff4400", 200, 0.4, 3);
    this.onDeath(this.x + this.w / 2, this.y + this.h / 2);
  }

  canBeExecuted(): boolean {
    return this.alive && this.executable && this.executionTime > 0;
  }

  update(dt: number, level: LevelData, mode: RenderMode, playerX: number, playerY: number, platformRects: { x: number; y: number; w: number; h: number }[]) {
    if (!this.alive) return;

    // Advance animation (dt is in seconds → convert to ms)
    updateAnim(this.anim, dt * 1000);

    this.animTime += dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;
    if (this.contactCooldown > 0) this.contactCooldown -= dt;
    if (this.attackCooldown > 0) this.attackCooldown -= dt;

    if (this.juggleResetTimer > 0) {
      this.juggleResetTimer -= dt;
      if (this.juggleResetTimer <= 0) this.juggleHits = 0;
    }

    if (this.executable) {
      this.executionTime -= dt;
      if (this.executionTime <= 0) {
        this.executable = false;
        this.state = "patrol";
        this.staggerAccum = 0;
        if (this.bossRuntime) this.bossRuntime.coreShield = 100;
        // Return to idle
        if (this.isBoss && this.bossRuntime) {
          playAnim(this.anim, BOSS_CATALOG[this.bossRuntime.templateId].idleAnim, AnimPhase.Idle);
        } else {
          playAnim(this.anim, { key: `${this.type}_idle`, frames: 4, fps: 8, loop: true }, AnimPhase.Idle);
        }
      }
    }

    if (this.type === "hazard") return;

    // Boss AI driven by roster
    if (this.isBoss && this.bossRuntime) {
      const dtFrames = dt * 60; // approximate fixed-step
      const { telegraphStarted, attackStarted } = updateBoss(this.bossRuntime, dtFrames);

      if (telegraphStarted && this.bossRuntime.currentAttack) {
        playAnim(this.anim, this.bossRuntime.currentAttack.anims.telegraph, AnimPhase.Telegraph);
        this.startBossTelegraph(playerX, playerY);
      }
      if (attackStarted && this.bossRuntime.currentAttack) {
        playAnim(this.anim, this.bossRuntime.currentAttack.anims.active, AnimPhase.Attack, () => {
          playAnim(this.anim, this.bossRuntime!.currentAttack!.anims.recovery, AnimPhase.Idle);
        });
        this.executeBossAttack(playerX, playerY);
      }
    }

    // Staggered
    if (this.state === "staggered") {
      this.staggerTime -= dt;
      this.vy += 1200 * dt;
      this.applyCollision(dt, level, mode, platformRects);
      if (this.staggerTime <= 0) {
        this.state = "patrol";
        this.executable = false;
        this.airborne = false;
        if (this.bossRuntime) this.bossRuntime.coreShield = 100;
      }
      return;
    }

    // Airborne / juggle
    if (this.airborne) {
      this.vy += 1000 * dt;
      this.applyCollision(dt, level, mode, platformRects);
      // landing detection kept simple
      return;
    }

    const distToPlayer = dist(this.x + this.w / 2, this.y + this.h / 2, playerX, playerY);

    if (this.type === "walker") {
      if (distToPlayer < 200) {
        this.state = "chase";
        if (this.anim.phase !== AnimPhase.Chase) {
          playAnim(this.anim, { key: "walker_chase", frames: 6, fps: 12, loop: true }, AnimPhase.Chase);
        }
      } else {
        this.state = "patrol";
        if (this.anim.phase !== AnimPhase.Patrol && this.anim.phase !== AnimPhase.Idle) {
          playAnim(this.anim, { key: "walker_patrol", frames: 4, fps: 8, loop: true }, AnimPhase.Patrol);
        }
      }

      if (this.state === "chase") {
        const dir = sign(playerX - this.x);
        this.facing = dir;
        this.vx = approach(this.vx, dir * 140, 800 * dt);
      } else {
        if (this.x < this.patrolStartX - this.patrolRange) this.facing = 1;
        else if (this.x > this.patrolStartX + this.patrolRange) this.facing = -1;
        this.vx = approach(this.vx, this.facing * 60, 400 * dt);
      }
    } else if (this.type === "shooter") {
      if (distToPlayer < 250) {
        this.state = "attack";
        this.facing = sign(playerX - this.x);
        if (this.anim.phase !== AnimPhase.Attack) {
          playAnim(this.anim, { key: "shooter_attack", frames: 5, fps: 14, loop: true }, AnimPhase.Attack);
        }

        if (distToPlayer < 120) this.vx = approach(this.vx, -sign(playerX - this.x) * 80, 600 * dt);
        else if (distToPlayer > 180) this.vx = approach(this.vx, sign(playerX - this.x) * 60, 600 * dt);
        else this.vx = approach(this.vx, 0, 800 * dt);

        if (this.attackCooldown <= 0) {
          const dx = playerX - (this.x + this.w / 2);
          const dy = playerY - (this.y + this.h / 2);
          const len = Math.sqrt(dx * dx + dy * dy);
          if (len > 0) {
            this.onShoot(this.x + this.w / 2, this.y + this.h / 2, dx / len, dy / len, 280, this.damage);
            this.attackCooldown = 1.5;
            this.onParticles(this.x + this.w / 2, this.y + this.h / 2, 4, "#ff6600", 80, 0.2, 2);
          }
        }
      } else {
        this.state = "patrol";
        this.vx = approach(this.vx, 0, 400 * dt);
        if (this.anim.phase !== AnimPhase.Idle) {
          playAnim(this.anim, { key: "shooter_idle", frames: 4, fps: 8, loop: true }, AnimPhase.Idle);
        }
      }
    } else if (this.type === "boss" && this.bossRuntime) {
      // Movement still handled here
      this.facing = sign(playerX - this.x);
      const targetDist = 120;
      if (distToPlayer > targetDist + 40) {
        this.vx = approach(this.vx, this.facing * (80 + this.bossRuntime.phaseIndex * 30), 600 * dt);
      } else if (distToPlayer < targetDist - 40) {
        this.vx = approach(this.vx, -this.facing * 60, 600 * dt);
      } else {
        this.vx = approach(this.vx, 0, 400 * dt);
      }
    }

    this.vy += 1200 * dt;
    if (this.vy > 800) this.vy = 800;
    this.applyCollision(dt, level, mode, platformRects);
  }

  private startBossTelegraph(_playerX: number, _playerY: number) {
    if (!this.bossRuntime?.currentAttack) return;
    const attack = this.bossRuntime.currentAttack;

    // Simple telegraph shapes based on attack id
    if (attack.id === "slam") {
      this.telegraphRect = {
        x: this.facing > 0 ? this.x + this.w : this.x - 120,
        y: this.y - 10,
        w: 120, h: 50,
      };
    } else if (attack.id === "beam") {
      this.telegraphRect = {
        x: this.facing > 0 ? this.x + this.w : this.x - 200,
        y: this.y + this.h * 0.3,
        w: 200, h: 20,
      };
    } else {
      this.telegraphRect = { x: this.x - 40, y: this.y - 40, w: this.w + 80, h: this.h + 80 };
    }
  }

  private executeBossAttack(playerX: number, playerY: number) {
    this.telegraphRect = null;
    if (!this.bossRuntime?.currentAttack) return;

    const attack = this.bossRuntime.currentAttack;
    const dx = playerX - (this.x + this.w / 2);
    const dy = playerY - (this.y + this.h / 2);

    const spread = 3 + this.bossRuntime.phaseIndex * 2;
    for (let i = 0; i < spread; i++) {
      const angle = Math.atan2(dy, dx) + (i - (spread - 1) / 2) * 0.25;
      this.onShoot(
        this.x + this.w / 2,
        this.y + this.h / 2,
        Math.cos(angle),
        Math.sin(angle),
        250,
        attack.damage,
      );
    }
    this.onParticles(this.x + this.w / 2, this.y + this.h / 2, 10, attack.color, 120, 0.3, 3);
    this.onShake(6, 0.15);
  }

  private applyCollision(dt: number, level: LevelData, mode: RenderMode, platformRects: { x: number; y: number; w: number; h: number }[]) {
    const solidRects = getCollisionRects(level, mode);
    const all = [...solidRects, ...platformRects];

    this.x += this.vx * dt;
    for (const r of all) {
      if (rectOverlap(this.x, this.y, this.w, this.h, r.x, r.y, r.w, r.h)) {
        if (this.vx > 0) this.x = r.x - this.w;
        else if (this.vx < 0) this.x = r.x + r.w;
        this.vx = 0;
        this.facing *= -1;
      }
    }

    this.y += this.vy * dt;
    let grounded = false;
    for (const r of all) {
      if (rectOverlap(this.x, this.y, this.w, this.h, r.x, r.y, r.w, r.h)) {
        if (this.vy > 0) {
          this.y = r.y - this.h;
          grounded = true;
        } else if (this.vy < 0) {
          this.y = r.y + r.h;
        }
        this.vy = 0;
      }
    }

    if (this.type === "walker" && grounded && this.state === "patrol") {
      const checkX = this.x + (this.facing > 0 ? this.w + 4 : -4);
      const checkY = this.y + this.h + 4;
      let hasGround = false;
      for (const r of all) {
        if (rectOverlap(checkX, checkY, 4, 4, r.x, r.y, r.w, r.h)) {
          hasGround = true;
          break;
        }
      }
      if (!hasGround) {
        this.facing *= -1;
        this.vx = 0;
      }
    }

    this.x = clamp(this.x, level.bounds.x, level.bounds.x + level.bounds.w - this.w);
    this.y = clamp(this.y, level.bounds.y, level.bounds.y + level.bounds.h - this.h);
  }

  render(ctx: CanvasRenderingContext2D, camX: number, camY: number, zoom: number, mode: RenderMode) {
    if (!this.alive) return;

    // Telegraph
    if (this.telegraphRect && this.bossRuntime && this.bossRuntime.telegraphFrames > 0) {
      const tr = this.telegraphRect;
      const tsx = (tr.x - camX) * zoom;
      const tsy = (tr.y - camY) * zoom;
      const tw = tr.w * zoom;
      const th = tr.h * zoom;
      const flash = 0.3 + Math.sin(this.animTime * 20) * 0.2;
      ctx.globalAlpha = flash;
      ctx.fillStyle = this.bossRuntime.currentAttack?.color ?? "#ff0044";
      ctx.fillRect(tsx, tsy, tw, th);
      ctx.strokeStyle = "#ff6688";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 3]);
      ctx.strokeRect(tsx, tsy, tw, th);
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    const sx = (this.x - camX) * zoom;
    const sy = (this.y - camY) * zoom;
    const sw = this.w * zoom;
    const sh = this.h * zoom;

    if (this.state === "staggered") {
      ctx.save();
      ctx.globalAlpha = 0.5 + Math.sin(this.animTime * 15) * 0.3;
    }

    let bodyColor = "#ff4400";
    let edgeColor = "#ff8844";
    if (this.type === "shooter") {
      bodyColor = "#ff8800";
      edgeColor = "#ffcc00";
    } else if (this.type === "hazard") {
      bodyColor = "#ff0066";
      edgeColor = "#ff44aa";
    } else if (this.type === "boss") {
      const shield = this.bossRuntime?.coreShield ?? 0;
      bodyColor = shield > 0 ? "#aa00ff" : "#ff0044";
      edgeColor = "#ff44ff";
    }

    if (mode === "wireframe") {
      ctx.strokeStyle = bodyColor;
      ctx.lineWidth = 2;
      ctx.strokeRect(sx, sy, sw, sh);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + sw, sy + sh);
      ctx.moveTo(sx + sw, sy);
      ctx.lineTo(sx, sy + sh);
      ctx.stroke();
    } else {
      ctx.fillStyle = this.hitFlash > 0 ? "#ffffff" : bodyColor;
      ctx.fillRect(sx, sy, sw, sh);
      ctx.strokeStyle = edgeColor;
      ctx.lineWidth = 2;
      ctx.strokeRect(sx, sy, sw, sh);

      // Eyes
      ctx.fillStyle = "#000";
      const eyeW = sw * 0.15;
      const eyeH = sh * 0.1;
      const eyeY = sy + sh * 0.25;
      if (this.facing > 0) ctx.fillRect(sx + sw * 0.6, eyeY, eyeW, eyeH);
      else ctx.fillRect(sx + sw * 0.25, eyeY, eyeW, eyeH);

      if (this.type === "shooter" && this.attackCooldown < 0.3) {
        ctx.fillStyle = "#ffff00";
        ctx.fillRect(sx + sw * 0.4, sy + sh * 0.5, sw * 0.2, sh * 0.1);
      }

      if (this.type === "hazard") {
        ctx.fillStyle = "#ff0066";
        for (let i = 0; i < 4; i++) {
          const spikeX = sx + (i + 0.5) * (sw / 4);
          ctx.beginPath();
          ctx.moveTo(spikeX - 4, sy);
          ctx.lineTo(spikeX, sy - 8 * zoom);
          ctx.lineTo(spikeX + 4, sy);
          ctx.fill();
        }
      }

      if (this.type === "boss") {
        const shield = this.bossRuntime?.coreShield ?? 0;
        if (shield > 0) {
          ctx.strokeStyle = "rgba(170,0,255,0.4)";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(sx + sw / 2, sy + sh / 2, sw * 0.7, 0, Math.PI * 2);
          ctx.stroke();
        }
        const coreOpen = this.bossRuntime?.coreOpenFrames ?? 0;
        if (coreOpen > 0 || this.state === "staggered") {
          ctx.fillStyle = "#00ffff";
          const coreSize = 8 * zoom + Math.sin(this.animTime * 8) * 2;
          ctx.beginPath();
          ctx.arc(sx + sw / 2, sy + sh / 2, coreSize, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = "#ff44ff";
        ctx.font = `${10 * zoom}px "Share Tech Mono"`;
        ctx.textAlign = "center";
        ctx.fillText(`P${(this.bossRuntime?.phaseIndex ?? 0) + 1}`, sx + sw / 2, sy - 6);
      }
    }

    if (this.state === "staggered") ctx.restore();

    if (this.canBeExecuted()) {
      const cx = sx + sw / 2;
      const cy = sy + sh / 2;
      const len = Math.max(sw, sh) * 0.8;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(this.addressLine);
      ctx.globalAlpha = 0.6 + Math.sin(this.animTime * 10) * 0.3;
      ctx.strokeStyle = "#00ffff";
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 4]);
      ctx.beginPath();
      ctx.moveTo(-len, 0);
      ctx.lineTo(len, 0);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = "#00ffff";
      ctx.font = `${10 * zoom}px "Share Tech Mono"`;
      ctx.textAlign = "center";
      ctx.fillText("EXEC", cx, sy - 4);
      ctx.globalAlpha = 1;
    }

    if (this.type !== "hazard" && this.hp < this.maxHP) {
      const barW = sw;
      const barH = this.type === "boss" ? 6 * zoom : 3 * zoom;
      const barX = sx;
      const barY = sy - barH - 2;
      ctx.fillStyle = "#330000";
      ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = this.type === "boss" ? "#ff44ff" : "#ff4444";
      ctx.fillRect(barX, barY, barW * (this.hp / this.maxHP), barH);
      if (this.type === "boss" && this.bossRuntime && this.bossRuntime.coreShield > 0) {
        ctx.fillStyle = "#aa00ff";
        ctx.fillRect(barX, barY - barH - 2, barW * (this.bossRuntime.coreShield / (this.bossRuntime.maxHealth > 0 ? this.bossRuntime.maxHealth : 100)), barH);
      }
    }
  }
}

export class Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  life: number = 3;
  fromEnemy: boolean;
  alive: boolean = true;
  w: number = 8;
  h: number = 8;
  anim: AnimState = createIdleAnim("projectile");

  constructor(x: number, y: number, vx: number, vy: number, damage: number, fromEnemy: boolean) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.damage = damage;
    this.fromEnemy = fromEnemy;
    playAnim(this.anim, {
      key: fromEnemy ? "proj_enemy" : "proj_player",
      frames: 4,
      fps: 16,
      loop: true,
    }, AnimPhase.Idle);
  }

  update(dt: number, level: LevelData, mode: RenderMode): boolean {
    updateAnim(this.anim, dt * 1000);
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
    if (this.life <= 0) return false;

    const solids = getCollisionRects(level, mode);
    for (const r of solids) {
      if (rectOverlap(this.x, this.y, this.w, this.h, r.x, r.y, r.w, r.h)) {
        return false;
      }
    }
    return true;
  }

  render(ctx: CanvasRenderingContext2D, camX: number, camY: number, zoom: number) {
    const sx = (this.x - camX) * zoom;
    const sy = (this.y - camY) * zoom;
    ctx.fillStyle = this.fromEnemy ? "#ff6600" : "#00ddff";
    ctx.shadowColor = this.fromEnemy ? "#ff6600" : "#00ddff";
    ctx.shadowBlur = 8;
    ctx.fillRect(sx, sy, this.w * zoom, this.h * zoom);
    ctx.shadowBlur = 0;
  }
}