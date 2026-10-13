import { Input } from "./Input";
import { LevelData, getCollisionRects, getOneWayRects } from "./Level";
import { RenderMode, SaveStateSnapshot } from "./types";
import { rectOverlap, clamp, sign, approach } from "./utils";
import { AttackKind, ATTACKS, LAUNCHER_ATTACK, AttackData, COMBO_GRACE_MS, STAMINA_SYSTEM, HEAT_SYSTEM } from "./CombatSystem";

export interface PlayerUpgrades {
  maxHP: number;
  maxCorruption: number;
  dashCooldown: number;
  attackDamage: number;
  attackRange: number;
  moveSpeed: number;
  jumpPower: number;
  maxAmmo: number;
  hasDoubleJump: boolean;
  hasWallJump: boolean;
  hasSaveState: boolean;
  hasOverride: boolean;
  maxStamina: number;
  hasLauncher: boolean;
}

export function defaultUpgrades(): PlayerUpgrades {
  return {
    maxHP: 100,
    maxCorruption: 100,
    dashCooldown: 0.8,
    attackDamage: 25,
    attackRange: 48,
    moveSpeed: 240,
    jumpPower: 420,
    maxAmmo: 20,
    hasDoubleJump: true,
    hasWallJump: true,
    hasSaveState: false,
    hasOverride: true,
    maxStamina: 100,
    hasLauncher: false,
  };
}

export class Player {
  x: number = 0;
  y: number = 0;
  w: number = 24;
  h: number = 36;
  vx: number = 0;
  vy: number = 0;

  hp: number = 100;
  maxHP: number = 100;
  corruption: number = 0;
  maxCorruption: number = 100;
  ammo: number = 20;
  maxAmmo: number = 20;

  facing: number = 1;
  grounded: boolean = false;
  wasGrounded: boolean = false;
  onWall: number = 0; // -1 left, 1 right, 0 none
  coyoteTime: number = 0;
  jumpCount: number = 0;

  // Dash (Frame-Rate Stutter Step)
  dashCooldown: number = 0;
  dashTime: number = 0;
  dashDuration: number = 0.18;
  dashSpeed: number = 600;
  isDashing: boolean = false;
  iframes: number = 0;
  afterimages: { x: number; y: number; life: number; facing: number }[] = [];

  // Attack
  attackTime: number = 0;
  attackDuration: number = 0.2;
  isAttacking: boolean = false;
  attackHit: boolean = false;
  attackCombo: number = 0;
  comboTimer: number = 0;
  attackKind: AttackKind = "light";
  currentAttack: AttackData | null = null;
  attackPhase: "startup" | "active" | "recovery" = "startup";

  // Stamina
  stamina: number = 100;
  maxStamina: number = 100;

  // Heat
  heat: number = 0;
  overheated: boolean = false;

  // Launcher / juggle
  isLaunchAttacking: boolean = false;

  // Buffered input queue
  inputBuffer: { action: string; time: number }[] = [];

  // Parry
  parryTime: number = 0;
  parryDuration: number = 0.15;
  parryCooldown: number = 0;
  isParrying: boolean = false;
  parryFlash: number = 0;

  // Override form
  inOverride: boolean = false;
  overrideTimer: number = 0;

  // Save State
  saveState: SaveStateSnapshot | null = null;
  saveStateCooldown: number = 0;

  // Hit flash
  hitFlash: number = 0;
  invuln: number = 0;

  // Animation
  animTime: number = 0;
  animState: string = "idle";

  upgrades: PlayerUpgrades;

  // Callbacks for game-level effects
  onShake: (intensity: number, duration: number) => void = () => {};
  onHitStop: (duration: number) => void = () => {};
  onParticles: (x: number, y: number, count: number, color: string, speed?: number, life?: number, size?: number) => void = () => {};
  onDamageEnemy: (x: number, y: number, damage: number) => void = () => {};
  onParrySuccess: () => void = () => {};
  onCorruptionGain: (amount: number) => void = () => {};

  constructor(upgrades: PlayerUpgrades) {
    this.upgrades = upgrades;
    this.hp = upgrades.maxHP;
    this.maxHP = upgrades.maxHP;
    this.maxCorruption = upgrades.maxCorruption;
    this.ammo = upgrades.maxAmmo;
    this.maxAmmo = upgrades.maxAmmo;
    this.stamina = upgrades.maxStamina;
    this.maxStamina = upgrades.maxStamina;
  }

  spawn(x: number, y: number) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.hp = this.maxHP;
    this.corruption = 0;
    this.ammo = this.maxAmmo;
    this.stamina = this.maxStamina;
    this.heat = 0;
    this.overheated = false;
    this.inOverride = false;
    this.overrideTimer = 0;
    this.attackCombo = 0;
    this.inputBuffer = [];
  }

  get effectiveSpeed(): number {
    let s = this.upgrades.moveSpeed;
    if (this.inOverride) s *= 1.6;
    return s;
  }

  get effectiveDamage(): number {
    let d = this.upgrades.attackDamage;
    if (this.inOverride) d *= 2;
    if (this.overheated) d *= HEAT_SYSTEM.overheatDamageMul;
    return d;
  }

  get staminaRegenRate(): number {
    return STAMINA_SYSTEM.regenPerSec;
  }

  get isOverheated(): boolean {
    return this.overheated;
  }

  get damageTakenMul(): number {
    return this.overheated ? HEAT_SYSTEM.overheatIncomingMul : 1.0;
  }

  get attackRect(): { x: number; y: number; w: number; h: number } | null {
    if (!this.isAttacking || this.attackHit) return null;
    if (this.attackPhase !== "active") return null;
    const range = this.upgrades.attackRange * (this.attackKind === "heavy" ? 1.3 : this.attackKind === "launcher" ? 1.1 : 1.0);
    return {
      x: this.facing > 0 ? this.x + this.w : this.x - range,
      y: this.y + (this.attackKind === "launcher" ? -8 : 4),
      w: range,
      h: this.h - 8 + (this.attackKind === "launcher" ? 16 : 0),
    };
  }

  get parryRect(): { x: number; y: number; w: number; h: number } | null {
    if (!this.isParrying) return null;
    return {
      x: this.facing > 0 ? this.x + this.w : this.x - 30,
      y: this.y - 4,
      w: 30,
      h: this.h + 8,
    };
  }

  takeDamage(amount: number, fromX: number) {
    if (this.invuln > 0 || this.iframes > 0 || this.isDashing) return;

    if (this.isParrying) {
      // Parry success
      this.parryFlash = 0.3;
      this.onParrySuccess();
      this.onShake(6, 0.15);
      this.onHitStop(0.08);
      this.corruption = Math.min(this.maxCorruption, this.corruption + 8);
      this.onCorruptionGain(8);
      this.stamina = Math.min(this.maxStamina, this.stamina + 15);
      this.vx = -sign(fromX - this.x) * 200;
      this.invuln = 0.2;
      return;
    }

    const actualAmount = amount * this.damageTakenMul;
    this.hp -= actualAmount;
    this.hitFlash = 0.25;
    this.invuln = 0.6;
    this.onShake(8, 0.25);
    this.onHitStop(0.06);
    this.onParticles(this.x + this.w / 2, this.y + this.h / 2, 12, "#ff0044", 200, 0.4, 3);
    this.vx = -sign(fromX - this.x) * 180;
    this.vy = -150;

    if (this.hp <= 0) {
      this.hp = 0;
    }
  }

  gainCorruption(amount: number) {
    this.corruption = Math.min(this.maxCorruption, this.corruption + amount);
    if (this.corruption >= this.maxCorruption && !this.inOverride) {
      this.activateOverride();
    }
  }

  private activateOverride() {
    this.inOverride = true;
    this.overrideTimer = 6;
    this.onShake(10, 0.5);
    this.onHitStop(0.15);
    this.onParticles(this.x + this.w / 2, this.y + this.h / 2, 40, "#00ff88", 300, 0.6, 4);
  }

  update(dt: number, input: Input, level: LevelData, mode: RenderMode, platformRects: { x: number; y: number; w: number; h: number }[]) {
    if (this.invuln > 0) this.invuln -= dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;
    if (this.parryFlash > 0) this.parryFlash -= dt;
    if (this.dashCooldown > 0) this.dashCooldown -= dt;
    if (this.parryCooldown > 0) this.parryCooldown -= dt;
    if (this.comboTimer > 0) { this.comboTimer -= dt; if (this.comboTimer <= 0) this.attackCombo = 0; }
    if (this.saveStateCooldown > 0) this.saveStateCooldown -= dt;

    // Stamina regen
    if (this.stamina < this.maxStamina) {
      this.stamina = Math.min(this.maxStamina, this.stamina + this.staminaRegenRate * dt);
    }

    // Heat system
    if (this.inOverride) {
      this.heat = Math.min(HEAT_SYSTEM.max, this.heat + HEAT_SYSTEM.overrideGainPerSec * dt);
    } else {
      this.heat = Math.max(0, this.heat - HEAT_SYSTEM.cooldownPerSec * dt);
    }
    if (this.heat >= HEAT_SYSTEM.max && !this.overheated) {
      this.overheated = true;
      this.onShake(5, 0.2);
    }
    if (this.overheated && this.heat <= 0) {
      this.overheated = false;
    }

    // Override timer
    if (this.inOverride) {
      this.overrideTimer -= dt;
      this.hp -= 5 * dt; // health decay
      if (this.overrideTimer <= 0 || this.hp <= 0) {
        this.inOverride = false;
        this.corruption = 0;
        this.onShake(6, 0.3);
      }
    }

    // I-frames from dash
    if (this.iframes > 0) this.iframes -= dt;

    // Dash state
    if (this.isDashing) {
      this.dashTime += dt;
      this.vx = this.facing * this.dashSpeed;
      this.vy = 0;

      // Spawn afterimage
      if (Math.random() < 0.6) {
        this.afterimages.push({ x: this.x, y: this.y, life: 0.4, facing: this.facing });
      }

      if (this.dashTime >= this.dashDuration) {
        this.isDashing = false;
        this.vx *= 0.3;
      }
    }

    // Update afterimages
    for (let i = this.afterimages.length - 1; i >= 0; i--) {
      this.afterimages[i].life -= dt;
      if (this.afterimages[i].life <= 0) this.afterimages.splice(i, 1);
    }

    // Attack state with phases
    if (this.isAttacking && this.currentAttack) {
      this.attackTime += dt;
      const a = this.currentAttack;
      if (this.attackPhase === "startup" && this.attackTime >= a.startup) {
        this.attackPhase = "active";
      } else if (this.attackPhase === "active" && this.attackTime >= a.startup + a.active) {
        this.attackPhase = "recovery";
        this.attackHit = false;
      } else if (this.attackPhase === "recovery" && this.attackTime >= a.startup + a.active + a.recovery) {
        this.isAttacking = false;
        this.attackHit = false;
        this.currentAttack = null;
        // Check buffered input for combo chain
        const now = this.animTime;
        for (let i = this.inputBuffer.length - 1; i >= 0; i--) {
          if (now - this.inputBuffer[i].time <= COMBO_GRACE_MS) {
            const action = this.inputBuffer[i].action;
            this.inputBuffer.splice(0, i + 1);
            if (action === "attack") {
              this.startAttack(false);
            } else if (action === "heavy") {
              this.startAttack(true);
            } else if (action === "launcher" && this.upgrades.hasLauncher) {
              this.startLauncher();
            }
            break;
          }
        }
      }
    }

    // Parry state
    if (this.isParrying) {
      this.parryTime += dt;
      if (this.parryTime >= this.parryDuration) {
        this.isParrying = false;
      }
    }

    // Input handling
    if (!this.isDashing) {
      // Horizontal movement
      const moveDir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      if (moveDir !== 0) {
        this.facing = moveDir;
        this.vx = approach(this.vx, moveDir * this.effectiveSpeed, 2000 * dt);
      } else {
        this.vx = approach(this.vx, 0, 1800 * dt);
      }

      // Jump
      if (input.jumpQueued && (this.grounded || this.coyoteTime > 0 || (this.upgrades.hasDoubleJump && this.jumpCount < 2))) {
        if (this.grounded || this.coyoteTime > 0) {
          this.vy = -this.upgrades.jumpPower;
          this.jumpCount = 1;
          this.coyoteTime = 0;
        } else if (this.upgrades.hasDoubleJump && this.jumpCount < 2) {
          this.vy = -this.upgrades.jumpPower * 0.85;
          this.jumpCount = 2;
          this.onParticles(this.x + this.w / 2, this.y + this.h, 8, "#00ddff", 120, 0.3, 2);
        }
        input.consumeJump();
      }

      // Variable jump height
      if (!input.jumpHeld && this.vy < -100) {
        this.vy *= 0.5;
      }

      // Wall jump
      if (this.upgrades.hasWallJump && input.jumpQueued && !this.grounded && this.onWall !== 0) {
        this.vy = -this.upgrades.jumpPower * 0.9;
        this.vx = -this.onWall * this.effectiveSpeed * 1.2;
        this.facing = -this.onWall;
        this.jumpCount = 1;
        input.consumeJump();
        this.onParticles(this.x + this.w / 2, this.y + this.h / 2, 10, "#ffaa00", 150, 0.3, 2);
      }

      // Dash
      if (input.dashQueued && this.dashCooldown <= 0 && this.stamina >= STAMINA_SYSTEM.dashCost) {
        this.isDashing = true;
        this.dashTime = 0;
        this.iframes = this.dashDuration + 0.05;
        this.dashCooldown = this.upgrades.dashCooldown;
        this.stamina -= STAMINA_SYSTEM.dashCost;
        input.consumeDash();
        this.onShake(3, 0.1);
        this.onParticles(this.x + this.w / 2, this.y + this.h / 2, 8, "#00ffff", 100, 0.3, 3);
      }

      // Attack - light (X) or heavy (hold X or V)
      if (input.attackQueued && !this.isAttacking) {
        this.startAttack(false);
        input.consumeAttack();
      } else if (input.attackQueued && this.isAttacking && this.attackPhase !== "startup") {
        // Buffer combo input
        this.inputBuffer.push({ action: "attack", time: this.animTime });
        input.consumeAttack();
      }

      // Heavy attack (V key)
      if (input.justPressed("KeyV") && !this.isAttacking && this.stamina >= 20) {
        this.startAttack(true);
      } else if (input.justPressed("KeyV") && this.isAttacking && this.attackPhase !== "startup") {
        this.inputBuffer.push({ action: "heavy", time: this.animTime });
      }

      // Launcher (hold up + attack, or B key if unlocked)
      if (this.upgrades.hasLauncher && input.up && input.attackQueued && !this.isAttacking && this.stamina >= 15) {
        this.startLauncher();
        input.consumeAttack();
      }

      // Parry
      if (input.parryQueued && this.parryCooldown <= 0) {
        if (this.stamina >= 10) {
          this.isParrying = true;
          this.parryTime = 0;
          this.parryCooldown = 0.5;
          this.stamina -= 10;
          input.consumeParry();
        } else {
          // Parry miss penalty
          this.stamina = Math.max(0, this.stamina - this.maxStamina * STAMINA_SYSTEM.parryMissBurnPct);
          input.consumeParry();
        }
      }

      // Save State
      if (this.upgrades.hasSaveState) {
        if (input.saveStateQueued && this.saveStateCooldown <= 0) {
          this.saveState = {
            x: this.x, y: this.y, vx: this.vx, vy: this.vy,
            hp: this.hp, corruption: this.corruption, ammo: this.ammo,
          };
          this.saveStateCooldown = 1.0;
          this.onParticles(this.x + this.w / 2, this.y + this.h / 2, 15, "#ff00ff", 120, 0.5, 3);
          this.onShake(3, 0.1);
        }
        if (input.rewindQueued && this.saveState) {
          this.x = this.saveState.x;
          this.y = this.saveState.y;
          this.vx = this.saveState.vx;
          this.vy = this.saveState.vy;
          this.hp = this.saveState.hp;
          this.corruption = this.saveState.corruption;
          this.ammo = this.saveState.ammo;
          this.invuln = 0.3;
          this.saveState = null;
          this.onParticles(this.x + this.w / 2, this.y + this.h / 2, 20, "#ff00ff", 200, 0.5, 3);
          this.onShake(5, 0.2);
          this.onHitStop(0.05);
        }
      }
    }

    // Gravity
    if (!this.isDashing) {
      this.vy += 1200 * dt;
      if (this.vy > 900) this.vy = 900;

      // Wall slide
      if (!this.grounded && this.onWall !== 0 && this.vy > 0) {
        this.vy = Math.min(this.vy, 120);
      }
    }

    // Collision
    this.wasGrounded = this.grounded;
    this.grounded = false;
    this.onWall = 0;

    const solidRects = getCollisionRects(level, mode);
    const oneWayRects = getOneWayRects(level);
    const allPlatforms = [...solidRects, ...platformRects];

    // Horizontal collision
    this.x += this.vx * dt;
    for (const r of allPlatforms) {
      if (rectOverlap(this.x, this.y, this.w, this.h, r.x, r.y, r.w, r.h)) {
        if (this.vx > 0) {
          this.x = r.x - this.w;
          this.onWall = 1;
        } else if (this.vx < 0) {
          this.x = r.x + r.w;
          this.onWall = -1;
        }
        if (!this.isDashing) this.vx = 0;
      }
    }

    // Vertical collision
    this.y += this.vy * dt;
    for (const r of allPlatforms) {
      if (rectOverlap(this.x, this.y, this.w, this.h, r.x, r.y, r.w, r.h)) {
        if (this.vy > 0) {
          this.y = r.y - this.h;
          this.vy = 0;
          this.grounded = true;
          this.jumpCount = 0;
        } else if (this.vy < 0) {
          this.y = r.y + r.h;
          this.vy = 0;
        }
      }
    }

    // One-way platforms (only collide from above, and only when moving down)
    if (this.vy > 0 && !input.down) {
      for (const r of oneWayRects) {
        const prevBottom = this.y + this.h - this.vy * dt;
        if (prevBottom <= r.y + 2 && rectOverlap(this.x, this.y, this.w, this.h, r.x, r.y, r.w, r.h)) {
          this.y = r.y - this.h;
          this.vy = 0;
          this.grounded = true;
          this.jumpCount = 0;
        }
      }
    }

    // Coyote time
    if (this.grounded) {
      this.coyoteTime = 0.1;
    } else {
      this.coyoteTime = Math.max(0, this.coyoteTime - dt);
    }

    // Clamp to world bounds
    this.x = clamp(this.x, level.bounds.x, level.bounds.x + level.bounds.w - this.w);
    this.y = clamp(this.y, level.bounds.y, level.bounds.y + level.bounds.h - this.h);

    // Animation state
    this.animTime += dt;
    if (this.isDashing) this.animState = "dash";
    else if (this.isAttacking) this.animState = this.attackKind === "heavy" ? "heavyAttack" : this.attackKind === "launcher" ? "launcher" : "attack";
    else if (!this.grounded) this.animState = this.vy < 0 ? "jump" : "fall";
    else if (Math.abs(this.vx) > 10) this.animState = "run";
    else this.animState = "idle";
  }

  private startAttack(heavy: boolean) {
    const comboIdx = heavy ? 2 : this.attackCombo % 2;
    const base = ATTACKS[comboIdx];
    if (this.stamina < base.staminaCost) return;
    this.isAttacking = true;
    this.attackTime = 0;
    this.attackHit = false;
    this.attackPhase = "startup";
    this.attackKind = base.kind;
    this.currentAttack = base;
    if (!heavy) {
      this.attackCombo = (this.attackCombo + 1) % 2;
      this.comboTimer = 0.6;
    } else {
      this.attackCombo = 0;
    }
    this.stamina -= base.staminaCost;
    this.heat = Math.min(HEAT_SYSTEM.max, this.heat + HEAT_SYSTEM.attackGain);
    this.onShake(heavy ? 4 : 2, heavy ? 0.08 : 0.05);
  }

  private startLauncher() {
    if (this.stamina < LAUNCHER_ATTACK.staminaCost) return;
    this.isAttacking = true;
    this.attackTime = 0;
    this.attackHit = false;
    this.attackPhase = "startup";
    this.attackKind = "launcher";
    this.currentAttack = LAUNCHER_ATTACK;
    this.stamina -= LAUNCHER_ATTACK.staminaCost;
    this.heat = Math.min(HEAT_SYSTEM.max, this.heat + HEAT_SYSTEM.attackGain);
    this.onShake(4, 0.1);
  }

  getAttackData(): AttackData | null {
    return this.currentAttack;
  }

  render(ctx: CanvasRenderingContext2D, camX: number, camY: number, zoom: number, mode: RenderMode) {
    const sx = (this.x - camX) * zoom;
    const sy = (this.y - camY) * zoom;
    const sw = this.w * zoom;
    const sh = this.h * zoom;

    // Afterimages
    for (const a of this.afterimages) {
      const ax = (a.x - camX) * zoom;
      const ay = (a.y - camY) * zoom;
      ctx.globalAlpha = (a.life / 0.4) * 0.4;
      ctx.fillStyle = "#00ffff";
      ctx.fillRect(ax, ay, sw, sh);
    }
    ctx.globalAlpha = 1;

    // Override glow
    if (this.inOverride) {
      ctx.save();
      ctx.shadowColor = "#00ff88";
      ctx.shadowBlur = 20;
      ctx.fillStyle = "#00ff88";
      ctx.fillRect(sx - 2, sy - 2, sw + 4, sh + 4);
      ctx.restore();
    }

    // I-frame shimmer
    if (this.iframes > 0 || this.invuln > 0) {
      const blink = Math.sin(this.animTime * 30) > 0;
      if (blink) {
        ctx.globalAlpha = 0.4;
      }
    }

    // Hit flash
    if (this.hitFlash > 0) {
      ctx.fillStyle = "#ff0044";
    } else if (mode === "wireframe") {
      ctx.fillStyle = "#00ff44";
      ctx.strokeStyle = "#00ff44";
    } else if (this.inOverride) {
      ctx.fillStyle = "#00ff88";
    } else {
      ctx.fillStyle = "#00ddff";
    }

    ctx.fillRect(sx, sy, sw, sh);

    // Outline
    ctx.strokeStyle = this.inOverride ? "#00ffaa" : "#0088ff";
    ctx.lineWidth = 2;
    ctx.strokeRect(sx, sy, sw, sh);

    // Visor / face indicator
    ctx.fillStyle = "#001122";
    const visorX = this.facing > 0 ? sx + sw * 0.55 : sx + sw * 0.15;
    ctx.fillRect(visorX, sy + sh * 0.15, sw * 0.3, sh * 0.15);

    // Parry flash
    if (this.parryFlash > 0) {
      ctx.globalAlpha = this.parryFlash / 0.3 * 0.6;
      ctx.fillStyle = "#ffff00";
      const pr = this.parryRect;
      if (pr) {
        ctx.fillRect((pr.x - camX) * zoom, (pr.y - camY) * zoom, pr.w * zoom, pr.h * zoom);
      }
      ctx.globalAlpha = 1;
    }

    // Attack visual
    if (this.isAttacking && this.attackPhase === "active") {
      const ar = this.attackRect;
      if (ar) {
        const a = this.currentAttack;
        const t = a ? (this.attackTime - a.startup) / a.active : 0;
        ctx.globalAlpha = (1 - t) * 0.8;
        const color = this.attackKind === "heavy" ? "#ff4400" : this.attackKind === "launcher" ? "#ff00ff" : this.inOverride ? "#00ff88" : "#00ddff";
        ctx.fillStyle = color;
        const ax = (ar.x - camX) * zoom;
        const ay = (ar.y - camY) * zoom;
        const aw = ar.w * zoom;
        const ah = ar.h * zoom;
        if (this.attackKind === "launcher") {
          // Upward slash
          ctx.beginPath();
          ctx.moveTo(ax, ay + ah);
          ctx.lineTo(ax + aw * 0.5, ay);
          ctx.lineTo(ax + aw, ay + ah * 0.7);
          ctx.closePath();
          ctx.fill();
        } else {
          ctx.fillRect(ax, ay + ah * 0.15, aw, ah * 0.7);
        }
        ctx.globalAlpha = 1;
      }
    }

    // Save state marker
    if (this.saveState) {
      const ssx = (this.saveState.x - camX) * zoom;
      const ssy = (this.saveState.y - camY) * zoom;
      ctx.globalAlpha = 0.4 + Math.sin(this.animTime * 5) * 0.2;
      ctx.strokeStyle = "#ff00ff";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(ssx, ssy, sw, sh);
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    ctx.globalAlpha = 1;
  }

  renderHUDExtras(ctx: CanvasRenderingContext2D, x: number, y: number) {
    // Stamina bar
    const sBarW = 120;
    const sBarH = 6;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(x - 2, y - 2, sBarW + 4, sBarH + 4);
    ctx.fillStyle = "#002233";
    ctx.fillRect(x, y, sBarW, sBarH);
    ctx.fillStyle = this.stamina > 30 ? "#00ddff" : "#ff8800";
    ctx.fillRect(x, y, sBarW * (this.stamina / this.maxStamina), sBarH);
    ctx.strokeStyle = "#3388aa";
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, sBarW, sBarH);

    // Heat bar
    const hBarW = 120;
    const hBarH = 4;
    const hY = y + sBarH + 4;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(x - 2, hY - 2, hBarW + 4, hBarH + 4);
    ctx.fillStyle = "#220000";
    ctx.fillRect(x, hY, hBarW, hBarH);
    ctx.fillStyle = this.overheated ? "#ff4400" : "#ffaa00";
    ctx.fillRect(x, hY, hBarW * (this.heat / HEAT_SYSTEM.max), hBarH);
  }
}
