import { LevelData, getCollisionRects } from "./Level";
import { RenderMode, EnemyState } from "./types";
import { rectOverlap, clamp, dist, sign, approach } from "./utils";
import { juggleDamage } from "./CombatSystem";

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
  addressLine: number = 0; // angle of execution line
  executable: boolean = false;
  executionTime: number = 0; // time window to execute

  // Juggle state
  airborne: boolean = false;
  juggleHits: number = 0;
  juggleResetTimer: number = 0;

  // Boss state
  isBoss: boolean = false;
  coreShield: number = 100;
  bossPhase: number = 0;
  telegraphTimer: number = 0;
  telegraphDuration: number = 0;
  telegraphRect: { x: number; y: number; w: number; h: number } | null = null;
  bossAttackTimer: number = 0;

  // Callbacks
  onShake: (i: number, d: number) => void = () => {};
  onHitStop: (d: number) => void = () => {};
  onParticles: (x: number, y: number, count: number, color: string, speed?: number, life?: number, size?: number) => void = () => {};
  onShoot: (x: number, y: number, dx: number, dy: number, speed: number, damage: number) => void = () => {};
  onDeath: (x: number, y: number) => void = () => {};

  // Walker patrol
  patrolStartX: number;
  patrolRange: number = 96;

  // Contact damage cooldown
  contactCooldown: number = 0;

  constructor(type: EnemyType, x: number, y: number) {
    this.type = type;
    this.x = x;
    this.y = y;
    this.patrolStartX = x;

    if (type === "walker") {
      this.w = 28; this.h = 32;
      this.hp = 60; this.maxHP = 60;
      this.damage = 15;
    } else if (type === "shooter") {
      this.w = 30; this.h = 36;
      this.hp = 40; this.maxHP = 40;
      this.damage = 10;
    } else if (type === "boss") {
      this.w = 64; this.h = 72;
      this.hp = 400; this.maxHP = 400;
      this.damage = 25;
      this.staggerThreshold = 100;
      this.isBoss = true;
      this.coreShield = 100;
    } else {
      this.w = 32; this.h = 32;
      this.hp = 999; this.maxHP = 999;
      this.damage = 20;
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

    this.hp -= actualDamage;
    this.hitFlash = 0.15;
    this.staggerAccum += actualDamage;
    this.onShake(4, 0.1);
    this.onHitStop(0.04);
    this.onParticles(this.x + this.w / 2, this.y + this.h / 2, 6, "#ffaa00", 150, 0.3, 2);

    if (launch) {
      this.airborne = true;
      this.vy = -400;
      this.vx = -sign(fromX - this.x) * 80;
      this.juggleHits = 0;
    } else {
      // Knockback
      this.vx = -sign(fromX - this.x) * 120;
      if (!this.airborne) this.vy = -80;
    }

    // Boss shield depletion
    if (this.isBoss) {
      this.coreShield = Math.max(0, this.coreShield - actualDamage * 0.15);
    }

    if (this.staggerAccum >= this.staggerThreshold && this.state !== "staggered") {
      this.state = "staggered";
      this.staggerTime = this.isBoss ? 4 : 2.5;
      this.executable = true;
      this.executionTime = this.isBoss ? 4 : 2.5;
      this.addressLine = Math.random() * Math.PI;
      this.staggerAccum = 0;
      this.coreShield = 0;
      this.onShake(this.isBoss ? 10 : 5, this.isBoss ? 0.3 : 0.15);
    }

    if (this.hp <= 0) {
      this.die();
      return true;
    }
    return false;
  }

  execute() {
    if (!this.alive || !this.executable) return;
    this.onParticles(this.x + this.w / 2, this.y + this.h / 2, 30, "#00ffff", 300, 0.6, 4);
    this.onParticles(this.x + this.w / 2, this.y + this.h / 2, 15, "#ffffff", 200, 0.5, 3);
    this.onShake(8, 0.3);
    this.onHitStop(0.1);
    this.die();
    // Drop extra currency
    this.onDeath(this.x + this.w / 2, this.y + this.h / 2);
  }

  private die() {
    this.alive = false;
    this.state = "dead";
    this.onParticles(this.x + this.w / 2, this.y + this.h / 2, 15, "#ff4400", 200, 0.4, 3);
    this.onDeath(this.x + this.w / 2, this.y + this.h / 2);
  }

  canBeExecuted(): boolean {
    return this.alive && this.executable && this.executionTime > 0;
  }

  update(dt: number, level: LevelData, mode: RenderMode, playerX: number, playerY: number, platformRects: { x: number; y: number; w: number; h: number }[]) {
    if (!this.alive) return;

    this.animTime += dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;
    if (this.contactCooldown > 0) this.contactCooldown -= dt;
    if (this.attackCooldown > 0) this.attackCooldown -= dt;

    // Juggle reset
    if (this.juggleResetTimer > 0) {
      this.juggleResetTimer -= dt;
      if (this.juggleResetTimer <= 0) {
        this.juggleHits = 0;
      }
    }

    // Execution timer
    if (this.executable) {
      this.executionTime -= dt;
      if (this.executionTime <= 0) {
        this.executable = false;
        this.state = "patrol";
        this.staggerAccum = 0;
        if (this.isBoss) this.coreShield = 100;
      }
    }

    if (this.type === "hazard") return;

    // Boss telegraph update
    if (this.isBoss && this.telegraphTimer > 0) {
      this.telegraphTimer -= dt;
      if (this.telegraphTimer <= 0) {
        // Execute boss attack
        this.executeBossAttack(playerX, playerY);
      }
    }

    // Staggered state
    if (this.state === "staggered") {
      this.staggerTime -= dt;
      this.vy += 1200 * dt;
      this.applyCollision(dt, level, mode, platformRects);
      if (this.staggerTime <= 0) {
        this.state = "patrol";
        this.executable = false;
        this.airborne = false;
        if (this.isBoss) this.coreShield = 100;
      }
      return;
    }

    // Airborne state (juggled)
    if (this.airborne) {
      this.vy += 1000 * dt;
      const wasAirborne = this.airborne;
      this.applyCollision(dt, level, mode, platformRects);
      if (this.vy >= 0 && this.y >= this.patrolStartX) {
        // Check if landed (vy was set to 0 by collision)
        const prevY = this.y;
        this.y += 1;
        const solids = getCollisionRects(level, mode);
        let landed = false;
        for (const r of [...solids, ...platformRects]) {
          if (rectOverlap(this.x, this.y, this.w, this.h, r.x, r.y, r.w, r.h)) {
            landed = true;
            break;
          }
        }
        this.y = prevY;
        if (landed) {
          this.airborne = false;
          this.juggleHits = 0;
        }
      }
      void wasAirborne;
      return;
    }

    const distToPlayer = dist(this.x + this.w / 2, this.y + this.h / 2, playerX, playerY);

    if (this.type === "walker") {
      if (distToPlayer < 200) {
        this.state = "chase";
      } else {
        this.state = "patrol";
      }

      if (this.state === "chase") {
        const dir = sign(playerX - this.x);
        this.facing = dir;
        this.vx = approach(this.vx, dir * 140, 800 * dt);
      } else {
        if (this.x < this.patrolStartX - this.patrolRange) {
          this.facing = 1;
        } else if (this.x > this.patrolStartX + this.patrolRange) {
          this.facing = -1;
        }
        this.vx = approach(this.vx, this.facing * 60, 400 * dt);
      }
    } else if (this.type === "shooter") {
      if (distToPlayer < 250) {
        this.state = "attack";
        this.facing = sign(playerX - this.x);
        if (distToPlayer < 120) {
          this.vx = approach(this.vx, -sign(playerX - this.x) * 80, 600 * dt);
        } else if (distToPlayer > 180) {
          this.vx = approach(this.vx, sign(playerX - this.x) * 60, 600 * dt);
        } else {
          this.vx = approach(this.vx, 0, 800 * dt);
        }

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
      }
    } else if (this.type === "boss") {
      this.updateBoss(dt, playerX, playerY);
    }

    // Gravity
    this.vy += 1200 * dt;
    if (this.vy > 800) this.vy = 800;

    this.applyCollision(dt, level, mode, platformRects);
  }

  private updateBoss(dt: number, playerX: number, playerY: number) {
    const distToPlayer = dist(this.x + this.w / 2, this.y + this.h / 2, playerX, playerY);
    this.facing = sign(playerX - this.x);

    // Phase transitions at 66% and 33% HP
    const hpPct = this.hp / this.maxHP;
    if (hpPct < 0.33 && this.bossPhase < 2) {
      this.bossPhase = 2;
      this.onShake(12, 0.4);
      this.telegraphTimer = 0;
    } else if (hpPct < 0.66 && this.bossPhase < 1) {
      this.bossPhase = 1;
      this.onShake(8, 0.3);
    }

    // Movement: approach player but keep some distance
    const targetDist = 120;
    if (distToPlayer > targetDist + 40) {
      this.vx = approach(this.vx, this.facing * (80 + this.bossPhase * 30), 600 * dt);
    } else if (distToPlayer < targetDist - 40) {
      this.vx = approach(this.vx, -this.facing * 60, 600 * dt);
    } else {
      this.vx = approach(this.vx, 0, 400 * dt);
    }

    // Boss attack cycle
    if (this.telegraphTimer <= 0 && this.attackCooldown <= 0) {
      this.startBossTelegraph(playerX, playerY);
    }
  }

  private startBossTelegraph(_playerX: number, _playerY: number) {
    const attackType = Math.floor(Math.random() * (2 + this.bossPhase));
    this.telegraphDuration = 0.8 - this.bossPhase * 0.15;
    this.telegraphTimer = this.telegraphDuration;

    if (attackType === 0) {
      // Slam attack - wide area in front
      this.telegraphRect = {
        x: this.facing > 0 ? this.x + this.w : this.x - 120,
        y: this.y - 10,
        w: 120, h: 50,
      };
    } else if (attackType === 1) {
      // Projectile spread
      this.telegraphRect = { x: this.x + this.w / 2 - 5, y: this.y + this.h / 2 - 5, w: 10, h: 10 };
    } else {
      // AoE burst (phase 2+)
      this.telegraphRect = { x: this.x - 60, y: this.y - 60, w: this.w + 120, h: this.h + 120 };
    }
  }

  private executeBossAttack(playerX: number, playerY: number) {
    this.telegraphRect = null;
    this.attackCooldown = 2.0 - this.bossPhase * 0.4;

    const dx = playerX - (this.x + this.w / 2);
    const dy = playerY - (this.y + this.h / 2);

    // Multi-shot spread
    const spread = 3 + this.bossPhase * 2;
    for (let i = 0; i < spread; i++) {
      const angle = Math.atan2(dy, dx) + (i - (spread - 1) / 2) * 0.25;
      this.onShoot(this.x + this.w / 2, this.y + this.h / 2, Math.cos(angle), Math.sin(angle), 250, this.damage);
    }
    this.onParticles(this.x + this.w / 2, this.y + this.h / 2, 10, "#ff0044", 120, 0.3, 3);
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

    // Edge detection for walkers - turn around at ledges
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

    // Boss telegraph render
    if (this.telegraphTimer > 0 && this.telegraphRect) {
      const tr = this.telegraphRect;
      const tsx = (tr.x - camX) * zoom;
      const tsy = (tr.y - camY) * zoom;
      const tw = tr.w * zoom;
      const th = tr.h * zoom;
      const flash = 0.3 + Math.sin(this.animTime * 20) * 0.2;
      ctx.globalAlpha = flash;
      ctx.fillStyle = "#ff0044";
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

    // Staggered tint
    if (this.state === "staggered") {
      ctx.save();
      ctx.globalAlpha = 0.5 + Math.sin(this.animTime * 15) * 0.3;
    }

    // Body color by type
    let bodyColor = "#ff4400";
    let edgeColor = "#ff8844";
    if (this.type === "shooter") {
      bodyColor = "#ff8800";
      edgeColor = "#ffcc00";
    } else if (this.type === "hazard") {
      bodyColor = "#ff0066";
      edgeColor = "#ff44aa";
    } else if (this.type === "boss") {
      bodyColor = this.coreShield > 0 ? "#aa00ff" : "#ff0044";
      edgeColor = "#ff44ff";
    }

    if (mode === "wireframe") {
      ctx.strokeStyle = bodyColor;
      ctx.lineWidth = 2;
      ctx.strokeRect(sx, sy, sw, sh);
      // Inner pattern
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + sw, sy + sh);
      ctx.moveTo(sx + sw, sy);
      ctx.lineTo(sx, sy + sh);
      ctx.stroke();
    } else {
      if (this.hitFlash > 0) {
        ctx.fillStyle = "#ffffff";
      } else {
        ctx.fillStyle = bodyColor;
      }
      ctx.fillRect(sx, sy, sw, sh);

      ctx.strokeStyle = edgeColor;
      ctx.lineWidth = 2;
      ctx.strokeRect(sx, sy, sw, sh);

      // Eyes
      ctx.fillStyle = "#000";
      const eyeW = sw * 0.15;
      const eyeH = sh * 0.1;
      const eyeY = sy + sh * 0.25;
      if (this.facing > 0) {
        ctx.fillRect(sx + sw * 0.6, eyeY, eyeW, eyeH);
      } else {
        ctx.fillRect(sx + sw * 0.25, eyeY, eyeW, eyeH);
      }

      // Shooter indicator
      if (this.type === "shooter" && this.attackCooldown < 0.3) {
        ctx.fillStyle = "#ffff00";
        ctx.fillRect(sx + sw * 0.4, sy + sh * 0.5, sw * 0.2, sh * 0.1);
      }

      // Hazard spikes
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

      // Boss extras: core shield indicator and phase
      if (this.type === "boss") {
        if (this.coreShield > 0) {
          ctx.strokeStyle = "rgba(170,0,255,0.4)";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(sx + sw / 2, sy + sh / 2, sw * 0.7, 0, Math.PI * 2);
          ctx.stroke();
        }
        // Core (weak point) when open
        if (this.coreShield <= 0 || this.state === "staggered") {
          ctx.fillStyle = "#00ffff";
          const coreSize = 8 * zoom + Math.sin(this.animTime * 8) * 2;
          ctx.beginPath();
          ctx.arc(sx + sw / 2, sy + sh / 2, coreSize, 0, Math.PI * 2);
          ctx.fill();
        }
        // Phase indicator
        ctx.fillStyle = "#ff44ff";
        ctx.font = `${10 * zoom}px "Share Tech Mono"`;
        ctx.textAlign = "center";
        ctx.fillText(`P${this.bossPhase + 1}`, sx + sw / 2, sy - 6);
      }
    }

    if (this.state === "staggered") ctx.restore();

    // Execution line
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

      // "EXECUTE" indicator
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = "#00ffff";
      ctx.font = `${10 * zoom}px "Share Tech Mono"`;
      ctx.textAlign = "center";
      ctx.fillText("EXEC", cx, sy - 4);
      ctx.globalAlpha = 1;
    }

    // HP bar
    if (this.type !== "hazard" && this.hp < this.maxHP) {
      const barW = sw;
      const barH = this.type === "boss" ? 6 * zoom : 3 * zoom;
      const barX = sx;
      const barY = sy - barH - 2;
      ctx.fillStyle = "#330000";
      ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = this.type === "boss" ? "#ff44ff" : "#ff4444";
      ctx.fillRect(barX, barY, barW * (this.hp / this.maxHP), barH);
      // Boss shield bar
      if (this.type === "boss" && this.coreShield > 0) {
        ctx.fillStyle = "#aa00ff";
        ctx.fillRect(barX, barY - barH - 2, barW * (this.coreShield / 100), barH);
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

  constructor(x: number, y: number, vx: number, vy: number, damage: number, fromEnemy: boolean) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.damage = damage;
    this.fromEnemy = fromEnemy;
  }

  update(dt: number, level: LevelData, mode: RenderMode): boolean {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
    if (this.life <= 0) return false;

    // Check collision with solid tiles
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
