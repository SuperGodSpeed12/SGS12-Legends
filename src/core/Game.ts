import { Input } from "./Input";
import { Camera } from "./Camera";
import { ParticleSystem } from "./ParticleSystem";
import { Player, PlayerUpgrades, defaultUpgrades } from "./Player";
import { Enemy, Projectile, EnemyType } from "./Enemy";
import { LevelData, createTestLevel } from "./Level";
import { GlitchFX } from "./GlitchFX";
import { RenderMode } from "./types";
import { UpgradeStore, UPGRADE_OPTIONS } from "./Upgrades";
import { rectOverlap, rectOverlapRect, dist, clamp } from "./utils";
import { MovingPlatform } from "./MovingPlatform";

interface FloatingText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  vy: number;
}

interface CodeFragment {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  value: number;
  collected: boolean;
}

type GameScreen = "title" | "playing" | "paused" | "upgrade" | "gameover";

export class Game {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private input: Input;
  private camera: Camera;
  private particles: ParticleSystem;
  private glitch: GlitchFX;

  private level: LevelData;
  private player: Player;
  private enemies: Enemy[] = [];
  private projectiles: Projectile[] = [];
  private platforms: MovingPlatform[] = [];
  private fragments: CodeFragment[] = [];
  private floatingTexts: FloatingText[] = [];

  private mode: RenderMode = "normal";
  private modeSwitchCooldown: number = 0;

  private upgrades: PlayerUpgrades;
  private store: UpgradeStore;

  screen: GameScreen = "title";
  private screenTransition: number = 0;
  private terminalIdx: number = -1; // which terminal the player is near

  private gameTime: number = 0;
  private deaths: number = 0;
  private kills: number = 0;

  // Logical canvas size
  private viewW: number = 960;
  private viewH: number = 540;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.input = new Input();
    this.camera = new Camera();
    this.particles = new ParticleSystem();
    this.glitch = new GlitchFX();
    this.level = createTestLevel();
    this.upgrades = defaultUpgrades();
    this.store = new UpgradeStore();
    this.player = new Player(this.upgrades);

    this.setupCanvas();
    this.setupCallbacks();
    this.resetLevel();

    window.addEventListener("resize", () => this.setupCanvas());
  }

  private setupCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const targetW = this.viewW;
    const targetH = this.viewH;
    this.canvas.width = targetW * dpr;
    this.canvas.height = targetH * dpr;
    this.canvas.style.width = `${targetW}px`;
    this.canvas.style.height = `${targetH}px`;
    this.ctx.scale(dpr, dpr);
    this.ctx.imageSmoothingEnabled = false;

    this.camera.viewW = targetW;
    this.camera.viewH = targetH;
  }

  private setupCallbacks() {
    this.player.onShake = (i, d) => this.camera.shake(i, d);
    this.player.onHitStop = (d) => this.camera.hitStop(d);
    this.player.onParticles = (x, y, c, s, l, sz) => this.particles.burst(x, y, c, s, l, sz);
    this.player.onCorruptionGain = (amt) => this.glitch.triggerRGBSplit(amt * 0.3, 0.2);

    this.player.onParrySuccess = () => {
      this.glitch.triggerRGBSplit(4, 0.2);
      this.glitch.triggerGlitchBar(0.1);
    };
  }

  private resetLevel() {
    this.player.spawn(this.level.playerSpawn.x, this.level.playerSpawn.y);
    this.enemies = [];
    this.projectiles = [];
    this.fragments = [];
    this.floatingTexts = [];

    for (const spawn of this.level.enemySpawns) {
      const type = spawn.type as EnemyType;
      const enemy = new Enemy(type, spawn.x, spawn.y);
      enemy.onShake = (i, d) => this.camera.shake(i, d);
      enemy.onHitStop = (d) => this.camera.hitStop(d);
      enemy.onParticles = (x, y, c, s, l, sz) => this.particles.burst(x, y, c, s, l, sz);
      enemy.onShoot = (x, y, dx, dy, speed, dmg) => {
        this.projectiles.push(new Projectile(x, y, dx * speed, dy * speed, dmg, true));
      };
      enemy.onDeath = (x, y) => {
        this.kills++;
        this.spawnFragments(x, y, 2);
      };
      this.enemies.push(enemy);
    }

    this.platforms = this.level.movingPlatforms.map((mp) => new MovingPlatform(mp));
  }

  private spawnFragments(x: number, y: number, count: number) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 80;
      this.fragments.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 100,
        life: 8,
        value: 1,
        collected: false,
      });
    }
  }

  private addFloatingText(x: number, y: number, text: string, color: string) {
    this.floatingTexts.push({ x, y, text, color, life: 1.2, vy: -40 });
  }

  update(dt: number) {
    this.input.update(dt);
    this.glitch.update(dt);

    if (this.screen === "title") {
      if (this.input.justPressed("Space") || this.input.justPressed("Enter")) {
        this.screen = "playing";
        this.screenTransition = 0.5;
      }
      return;
    }

    if (this.screen === "gameover") {
      if (this.input.justPressed("Space") || this.input.justPressed("Enter")) {
        this.resetLevel();
        this.screen = "playing";
      }
      return;
    }

    if (this.input.menuToggle && this.screen === "playing") {
      this.screen = "paused";
      return;
    }
    if (this.input.menuToggle && this.screen === "paused") {
      this.screen = "playing";
      return;
    }

    if (this.screen === "paused") return;

    if (this.screen === "upgrade") {
      this.updateUpgradeScreen();
      return;
    }

    if (this.screenTransition > 0) {
      this.screenTransition -= dt;
    }

    // Camera hit-stop: decrement freeze timer but skip world updates while frozen
    if (this.camera.isFrozen) {
      this.camera.tickFreeze(dt);
      return;
    }

    this.gameTime += dt;
    if (this.modeSwitchCooldown > 0) this.modeSwitchCooldown -= dt;

    // Mode switching (Data Corruption)
    if (this.input.overrideQueued && this.upgrades.hasOverride && this.modeSwitchCooldown <= 0) {
      this.mode = this.mode === "normal" ? "wireframe" : "normal";
      this.modeSwitchCooldown = 0.5;
      this.camera.shake(6, 0.3);
      this.camera.hitStop(0.1);
      this.glitch.triggerRGBSplit(6, 0.4);
      this.glitch.triggerGlitchBar(0.3);
      this.particles.burst(this.player.x + this.player.w / 2, this.player.y + this.player.h / 2, 20,
        this.mode === "wireframe" ? "#00ff44" : "#00ddff", 200, 0.5, 3);
      this.addFloatingText(this.player.x, this.player.y - 20,
        this.mode === "wireframe" ? "WIREFRAME" : "NORMAL", this.mode === "wireframe" ? "#00ff44" : "#00ddff");
    }

    // Update moving platforms
    for (const p of this.platforms) p.update(dt, this.level);
    const platformRects = this.platforms.map((p) => ({ x: p.x, y: p.y, w: p.w, h: p.h }));

    // Update player
    this.player.update(dt, this.input, this.level, this.mode, platformRects);

    // Carry player on moving platforms
    for (const p of this.platforms) {
      if (p.carryPlayer && this.player.grounded) {
        this.player.x += p.deltaX;
        this.player.y += p.deltaY;
      }
    }

    // Player attack hits enemies
    const ar = this.player.attackRect;
    if (ar) {
      const attackData = this.player.getAttackData();
      const isLaunch = attackData?.launch ?? false;
      const hitStop = attackData?.hitStopMs ?? 0.05;
      const shakeAmt = attackData?.kind === "heavy" ? 5 : 3;
      for (const e of this.enemies) {
        if (!e.alive) continue;
        if (e.type === "hazard") continue;
        if (rectOverlapRect(ar, { x: e.x, y: e.y, w: e.w, h: e.h })) {
          if (!this.player.attackHit) {
            e.takeDamage(this.player.effectiveDamage, this.player.x + this.player.w / 2, isLaunch);
            this.player.attackHit = true;
            this.player.gainCorruption(5);
            this.camera.shake(shakeAmt, 0.08);
            this.camera.hitStop(hitStop);
            this.glitch.triggerGlitchBar(0.05);
            if (isLaunch) {
              this.addFloatingText(e.x, e.y - 10, "LAUNCH", "#ff00ff");
            }
          }
        }
      }
    }

    // Player dash execution check
    if (this.player.isDashing) {
      for (const e of this.enemies) {
        if (e.canBeExecuted() && rectOverlap(this.player.x, this.player.y, this.player.w, this.player.h, e.x, e.y, e.w, e.h)) {
          e.execute();
          this.spawnFragments(e.x + e.w / 2, e.y + e.h / 2, 5);
          this.store.fragments += 3;
          this.addFloatingText(e.x, e.y - 10, "EXECUTED +3", "#00ffff");
        }
      }
    }

    // Parry reflects projectiles
    const pr = this.player.parryRect;
    if (pr) {
      for (const proj of this.projectiles) {
        if (proj.fromEnemy && rectOverlapRect(pr, { x: proj.x, y: proj.y, w: proj.w, h: proj.h })) {
          proj.vx *= -1.5;
          proj.vy *= -1.5;
          proj.fromEnemy = false;
          proj.damage *= 2;
        }
      }
    }

    // Update enemies
    for (const e of this.enemies) {
      e.update(dt, this.level, this.mode, this.player.x + this.player.w / 2, this.player.y + this.player.h / 2, platformRects);

      // Contact damage
      if (e.alive && e.contactCooldown <= 0) {
        if (rectOverlap(this.player.x, this.player.y, this.player.w, this.player.h, e.x, e.y, e.w, e.h)) {
          this.player.takeDamage(e.damage, e.x + e.w / 2);
          e.contactCooldown = 0.5;
        }
      }
    }

    // Update projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const proj = this.projectiles[i];
      const alive = proj.update(dt, this.level, this.mode);

      if (alive) {
        // Hit player
        if (proj.fromEnemy && rectOverlap(this.player.x, this.player.y, this.player.w, this.player.h, proj.x, proj.y, proj.w, proj.h)) {
          this.player.takeDamage(proj.damage, proj.x);
          this.projectiles.splice(i, 1);
          continue;
        }
        // Hit enemies (reflected projectiles)
        if (!proj.fromEnemy) {
          for (const e of this.enemies) {
            if (e.alive && e.type !== "hazard" && rectOverlap(e.x, e.y, e.w, e.h, proj.x, proj.y, proj.w, proj.h)) {
              e.takeDamage(proj.damage, proj.x, false);
              this.projectiles.splice(i, 1);
              break;
            }
          }
        }
      } else {
        this.particles.burst(proj.x, proj.y, 6, proj.fromEnemy ? "#ff6600" : "#00ddff", 100, 0.2, 2);
        this.projectiles.splice(i, 1);
      }
    }

    // Hazard collision
    for (const h of this.level.hazards) {
      if (rectOverlap(this.player.x, this.player.y, this.player.w, this.player.h, h.x, h.y, h.w, h.h)) {
        this.player.takeDamage(25, h.x + h.w / 2);
      }
    }

    // Check terminal proximity
    this.terminalIdx = -1;
    for (let i = 0; i < this.level.terminals.length; i++) {
      const t = this.level.terminals[i];
      if (dist(this.player.x + this.player.w / 2, this.player.y + this.player.h / 2, t.x, t.y) < 60) {
        this.terminalIdx = i;
        break;
      }
    }

    if (this.terminalIdx >= 0 && this.input.interactQueued) {
      this.screen = "upgrade";
      return;
    }

    // Collect fragments
    for (const f of this.fragments) {
      if (f.collected) continue;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.vy += 300 * dt;
      f.vx *= 0.98;
      f.life -= dt;

      // Attract to player
      const d = dist(f.x, f.y, this.player.x + this.player.w / 2, this.player.y + this.player.h / 2);
      if (d < 80) {
        const ax = (this.player.x + this.player.w / 2 - f.x) / d;
        const ay = (this.player.y + this.player.h / 2 - f.y) / d;
        f.vx += ax * 400 * dt;
        f.vy += ay * 400 * dt;
      }

      if (d < 24) {
        f.collected = true;
        this.store.fragments += f.value;
        this.addFloatingText(f.x, f.y, `+${f.value}`, "#00ff88");
        this.particles.burst(f.x, f.y, 4, "#00ff88", 80, 0.3, 2);
      }

      if (f.life <= 0) f.collected = true;
    }
    this.fragments = this.fragments.filter((f) => !f.collected);

    // Floating texts
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const t = this.floatingTexts[i];
      t.y += t.vy * dt;
      t.vy *= 0.95;
      t.life -= dt;
      if (t.life <= 0) this.floatingTexts.splice(i, 1);
    }

    // Particles
    this.particles.update(dt);

    // Camera
    this.camera.update(dt, this.player.x + this.player.w / 2, this.player.y + this.player.h / 2, this.level.bounds.w, this.level.bounds.h);

    // Noise in override
    this.glitch.setNoise(this.player.inOverride ? 0.04 : 0);

    // Death
    if (this.player.hp <= 0) {
      this.deaths++;
      this.screen = "gameover";
      this.camera.shake(15, 0.5);
      this.glitch.triggerRGBSplit(10, 0.5);
    }

    // Reset player if fell out of bounds
    if (this.player.y > this.level.bounds.h) {
      this.player.takeDamage(100, this.player.x);
    }
  }

  private updateUpgradeScreen() {
    // Simple navigation
    if (this.input.justPressed("Escape") || this.input.justPressed("Tab")) {
      this.screen = "playing";
      return;
    }
    // Purchase with number keys
    for (let i = 0; i < UPGRADE_OPTIONS.length && i < 9; i++) {
      if (this.input.justPressed(`Digit${i + 1}`)) {
        const opt = UPGRADE_OPTIONS[i];
        if (this.store.canAfford(opt)) {
          this.store.purchase(opt, this.upgrades);
          this.player.maxHP = this.upgrades.maxHP;
          this.player.hp = this.upgrades.maxHP;
          this.player.maxCorruption = this.upgrades.maxCorruption;
          this.player.maxAmmo = this.upgrades.maxAmmo;
          this.player.ammo = this.upgrades.maxAmmo;
          this.player.maxStamina = this.upgrades.maxStamina;
          this.player.stamina = this.upgrades.maxStamina;
          this.addFloatingText(this.player.x, this.player.y - 20, "UPGRADED", "#00ff88");
          this.particles.burst(this.player.x + this.player.w / 2, this.player.y + this.player.h / 2, 20, "#00ff88", 200, 0.5, 3);
        }
      }
    }
  }

  render() {
    const ctx = this.ctx;
    ctx.fillStyle = "#080018";
    ctx.fillRect(0, 0, this.viewW, this.viewH);

    if (this.screen === "title") {
      this.renderTitle(ctx);
      return;
    }

    if (this.screen === "gameover") {
      this.renderGame(ctx);
      this.renderGameOver(ctx);
      return;
    }

    if (this.screen === "upgrade") {
      this.renderGame(ctx);
      this.renderUpgradeScreen(ctx);
      return;
    }

    if (this.screen === "paused") {
      this.renderGame(ctx);
      this.renderPaused(ctx);
      return;
    }

    this.renderGame(ctx);
  }

  private renderGame(ctx: CanvasRenderingContext2D) {
    const camX = this.camera.renderX;
    const camY = this.camera.renderY;
    const zoom = this.camera.zoom;
    const mode = this.mode;

    // Background grid
    this.renderBackground(ctx, camX, camY, zoom);

    // Level tiles
    this.renderLevel(ctx, camX, camY, zoom, mode);

    // Moving platforms
    for (const p of this.platforms) p.render(ctx, camX, camY, zoom, mode);

    // Hazards
    for (const h of this.level.hazards) {
      const sx = (h.x - camX) * zoom;
      const sy = (h.y - camY) * zoom;
      ctx.fillStyle = mode === "wireframe" ? "#ff0066" : "#ff0044";
      ctx.shadowColor = "#ff0044";
      ctx.shadowBlur = 10;
      ctx.fillRect(sx, sy, h.w * zoom, h.h * zoom);
      ctx.shadowBlur = 0;
      // Animated spikes
      ctx.fillStyle = "#ff66aa";
      for (let i = 0; i < 3; i++) {
        const spikeX = sx + (i + 0.5) * (h.w * zoom / 3);
        const offset = Math.sin(this.gameTime * 4 + i) * 3;
        ctx.beginPath();
        ctx.moveTo(spikeX - 4, sy + h.h * zoom);
        ctx.lineTo(spikeX, sy - 6 + offset);
        ctx.lineTo(spikeX + 4, sy + h.h * zoom);
        ctx.fill();
      }
    }

    // Terminals
    for (let i = 0; i < this.level.terminals.length; i++) {
      const t = this.level.terminals[i];
      const sx = (t.x - camX) * zoom;
      const sy = (t.y - camY) * zoom;
      const pulse = 0.5 + Math.sin(this.gameTime * 3 + i) * 0.3;
      ctx.globalAlpha = pulse;
      ctx.fillStyle = i === this.terminalIdx ? "#ffff00" : "#00ff88";
      ctx.fillRect(sx - 12, sy - 24, 24, 24);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "#00ff88";
      ctx.lineWidth = 2;
      ctx.strokeRect(sx - 12, sy - 24, 24, 24);

      if (i === this.terminalIdx) {
        ctx.fillStyle = "#ffff00";
        ctx.font = '12px "Share Tech Mono"';
        ctx.textAlign = "center";
        ctx.fillText("PRESS F", sx, sy - 30);
      }
    }

    // Enemies
    for (const e of this.enemies) e.render(ctx, camX, camY, zoom, mode);

    // Projectiles
    for (const proj of this.projectiles) proj.render(ctx, camX, camY, zoom);

    // Fragments
    for (const f of this.fragments) {
      if (f.collected) continue;
      const sx = (f.x - camX) * zoom;
      const sy = (f.y - camY) * zoom;
      ctx.fillStyle = "#00ff88";
      ctx.shadowColor = "#00ff88";
      ctx.shadowBlur = 6;
      ctx.fillRect(sx - 3, sy - 3, 6, 6);
      ctx.shadowBlur = 0;
    }

    // Player
    this.player.render(ctx, camX, camY, zoom, mode);

    // Particles
    this.particles.render(ctx, camX, camY, zoom);

    // Floating texts
    for (const t of this.floatingTexts) {
      const sx = (t.x - camX) * zoom;
      const sy = (t.y - camY) * zoom;
      ctx.globalAlpha = Math.min(1, t.life);
      ctx.fillStyle = t.color;
      ctx.font = `${14 * zoom}px "Share Tech Mono"`;
      ctx.textAlign = "center";
      ctx.fillText(t.text, sx, sy);
      ctx.globalAlpha = 1;
    }

    // Glitch FX overlay
    this.glitch.render(ctx, this.viewW, this.viewH, this.player.inOverride);

    // Screen transition flash
    if (this.screenTransition > 0) {
      ctx.globalAlpha = this.screenTransition / 0.5;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, this.viewW, this.viewH);
      ctx.globalAlpha = 1;
    }

    // HUD
    this.renderHUD(ctx);
  }

  private renderBackground(ctx: CanvasRenderingContext2D, camX: number, camY: number, zoom: number) {
    // Parallax grid
    const gridSize = 64;
    const offsetX = -camX * 0.3 * zoom;
    const offsetY = -camY * 0.3 * zoom;
    ctx.strokeStyle = this.mode === "wireframe" ? "rgba(0,255,68,0.08)" : "rgba(0,100,200,0.06)";
    ctx.lineWidth = 1;

    for (let x = offsetX % gridSize; x < this.viewW; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.viewH);
      ctx.stroke();
    }
    for (let y = offsetY % gridSize; y < this.viewH; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.viewW, y);
      ctx.stroke();
    }

    // Far background glow
    const grad = ctx.createRadialGradient(this.viewW / 2, this.viewH / 2, 50, this.viewW / 2, this.viewH / 2, this.viewW);
    if (this.mode === "wireframe") {
      grad.addColorStop(0, "rgba(0,40,20,0.3)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
    } else {
      grad.addColorStop(0, "rgba(10,5,40,0.3)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.viewW, this.viewH);
  }

  private renderLevel(ctx: CanvasRenderingContext2D, camX: number, camY: number, zoom: number, mode: RenderMode) {
    const ts = this.level.tileSize;
    const startTX = Math.floor(camX / ts);
    const endTX = Math.ceil((camX + this.viewW / zoom) / ts);
    const startTY = Math.floor(camY / ts);
    const endTY = Math.ceil((camY + this.viewH / zoom) / ts);

    // Background decorative layer
    for (let ty = startTY; ty <= endTY; ty++) {
      for (let tx = startTX; tx <= endTX; tx++) {
        if (tx < 0 || tx >= this.level.width || ty < 0 || ty >= this.level.height) continue;
        const tile = this.level.layers[0].data[ty * this.level.width + tx];
        if (tile === 5) {
          const sx = (tx * ts - camX) * zoom;
          const sy = (ty * ts - camY) * zoom;
          ctx.fillStyle = "rgba(20,20,60,0.3)";
          ctx.fillRect(sx, sy, ts * zoom, ts * zoom);
        }
      }
    }

    // Main layer
    for (let ty = startTY; ty <= endTY; ty++) {
      for (let tx = startTX; tx <= endTX; tx++) {
        if (tx < 0 || tx >= this.level.width || ty < 0 || ty >= this.level.height) continue;
        const tile = this.level.layers[1].data[ty * this.level.width + tx];
        if (tile === 0) continue;
        const sx = (tx * ts - camX) * zoom;
        const sy = (ty * ts - camY) * zoom;
        const sz = ts * zoom;

        if (tile === 1) {
          if (mode === "wireframe") {
            ctx.strokeStyle = "#00ff44";
            ctx.lineWidth = 1.5;
            ctx.strokeRect(sx, sy, sz, sz);
          } else {
            ctx.fillStyle = "#222244";
            ctx.fillRect(sx, sy, sz, sz);
            ctx.strokeStyle = "#3344aa";
            ctx.lineWidth = 2;
            ctx.strokeRect(sx, sy, sz, sz);
            // Inner detail
            ctx.strokeStyle = "rgba(50,60,120,0.5)";
            ctx.lineWidth = 1;
            ctx.strokeRect(sx + 4, sy + 4, sz - 8, sz - 8);
          }
        } else if (tile === 2) {
          // One-way platform
          ctx.fillStyle = mode === "wireframe" ? "rgba(0,255,68,0.3)" : "rgba(100,100,180,0.6)";
          ctx.fillRect(sx, sy, sz, sz * 0.3);
          ctx.strokeStyle = mode === "wireframe" ? "#00ff44" : "#6677cc";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(sx, sy + sz * 0.3);
          ctx.lineTo(sx + sz, sy + sz * 0.3);
          ctx.stroke();
        } else if (tile === 4) {
          if (mode === "normal") {
            ctx.fillStyle = "#332255";
            ctx.fillRect(sx, sy, sz, sz);
            ctx.strokeStyle = "#6644aa";
            ctx.lineWidth = 2;
            ctx.strokeRect(sx, sy, sz, sz);
            // Glitchy outline
            ctx.strokeStyle = "rgba(150,50,200,0.3)";
            ctx.lineWidth = 1;
            ctx.strokeRect(sx - 1, sy - 1, sz + 2, sz + 2);
          } else {
            // Wireframe: show as faded outline (passable)
            ctx.strokeStyle = "rgba(150,50,200,0.3)";
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.strokeRect(sx, sy, sz, sz);
            ctx.setLineDash([]);
          }
        }
      }
    }

    // Wireframe-only layer
    if (mode === "wireframe") {
      for (let ty = startTY; ty <= endTY; ty++) {
        for (let tx = startTX; tx <= endTX; tx++) {
          if (tx < 0 || tx >= this.level.width || ty < 0 || ty >= this.level.height) continue;
          const tile = this.level.layers[2].data[ty * this.level.width + tx];
          if (tile === 3) {
            const sx = (tx * ts - camX) * zoom;
            const sy = (ty * ts - camY) * zoom;
            const sz = ts * zoom;
            ctx.strokeStyle = "#00ff44";
            ctx.lineWidth = 2;
            ctx.strokeRect(sx, sy, sz, sz);
            ctx.fillStyle = "rgba(0,255,68,0.1)";
            ctx.fillRect(sx, sy, sz, sz);
          }
        }
      }
    }
  }

  private renderHUD(ctx: CanvasRenderingContext2D) {
    const padding = 16;
    ctx.font = '14px "Share Tech Mono"';

    // Health bar
    const hpBarW = 200;
    const hpBarH = 14;
    const hpX = padding;
    const hpY = padding;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(hpX - 2, hpY - 2, hpBarW + 4, hpBarH + 4);
    ctx.fillStyle = "#330000";
    ctx.fillRect(hpX, hpY, hpBarW, hpBarH);
    const hpRatio = this.player.hp / this.player.maxHP;
    ctx.fillStyle = hpRatio > 0.3 ? "#ff4466" : "#ff0044";
    ctx.fillRect(hpX, hpY, hpBarW * hpRatio, hpBarH);
    ctx.strokeStyle = "#ff6688";
    ctx.lineWidth = 1;
    ctx.strokeRect(hpX, hpY, hpBarW, hpBarH);
    ctx.fillStyle = "#fff";
    ctx.textAlign = "left";
    ctx.fillText(`SYS ${Math.ceil(this.player.hp)}/${this.player.maxHP}`, hpX + 4, hpY + 11);

    // Corruption bar
    const cBarW = 200;
    const cBarH = 10;
    const cX = padding;
    const cY = padding + hpBarH + 6;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(cX - 2, cY - 2, cBarW + 4, cBarH + 4);
    ctx.fillStyle = "#002200";
    ctx.fillRect(cX, cY, cBarW, cBarH);
    const cRatio = this.player.corruption / this.player.maxCorruption;
    ctx.fillStyle = this.player.inOverride ? "#00ff88" : "#88ff00";
    ctx.fillRect(cX, cY, cBarW * cRatio, cBarH);
    ctx.strokeStyle = "#44aa00";
    ctx.strokeRect(cX, cY, cBarW, cBarH);
    ctx.fillStyle = "#88ff00";
    ctx.font = '10px "Share Tech Mono"';
    ctx.fillText(`CORRUPT ${Math.floor(this.player.corruption)}%`, cX + 4, cY + 8);
    ctx.font = '14px "Share Tech Mono"';

    // Dash cooldown
    const dCD = this.player.dashCooldown / this.upgrades.dashCooldown;
    const dBarW = 60;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(padding - 2, cY + cBarH + 10, dBarW + 4, 8);
    ctx.fillStyle = dCD > 0 ? "#004444" : "#00ffff";
    ctx.fillRect(padding, cY + cBarH + 12, dBarW * (1 - dCD), 4);
    ctx.fillStyle = "#00ffff";
    ctx.font = '9px "Share Tech Mono"';
    ctx.fillText("DASH", padding, cY + cBarH + 28);

    // Stamina + Heat bars (from Player)
    this.player.renderHUDExtras(ctx, padding + 70, cY + cBarH + 8);

    // Overheat warning
    if (this.player.isOverheated) {
      ctx.fillStyle = "#ff4400";
      ctx.font = 'bold 10px "Share Tech Mono"';
      ctx.textAlign = "left";
      const oBlink = Math.sin(this.gameTime * 12) > 0;
      if (oBlink) ctx.fillText("OVERHEAT", padding + 200, cY + cBarH + 16);
    }

    // Fragments
    ctx.font = '14px "Share Tech Mono"';
    ctx.fillStyle = "#00ff88";
    ctx.textAlign = "right";
    ctx.fillText(`CODE: ${this.store.fragments}`, this.viewW - padding, padding + 14);

    // Mode indicator
    ctx.fillStyle = this.mode === "wireframe" ? "#00ff44" : "#00ddff";
    ctx.font = '12px "Share Tech Mono"';
    ctx.fillText(this.mode === "wireframe" ? "[WIREFRAME]" : "[NORMAL]", this.viewW - padding, padding + 32);

    // Override indicator
    if (this.player.inOverride) {
      ctx.fillStyle = "#00ff88";
      ctx.font = 'bold 16px "Share Tech Mono"';
      ctx.textAlign = "center";
      const blink = Math.sin(this.gameTime * 10) > 0;
      if (blink) {
        ctx.fillText("OVERRIDE ACTIVE", this.viewW / 2, padding + 14);
      }
      ctx.font = '12px "Share Tech Mono"';
      ctx.fillText(`${this.player.overrideTimer.toFixed(1)}s`, this.viewW / 2, padding + 30);
    }

    // Terminal prompt
    if (this.terminalIdx >= 0 && this.screen === "playing") {
      ctx.fillStyle = "#ffff00";
      ctx.font = '12px "Share Tech Mono"';
      ctx.textAlign = "center";
      ctx.fillText("[F] UPGRADE TERMINAL", this.viewW / 2, this.viewH - 30);
    }

    // Controls hint (first 10 seconds)
    if (this.gameTime < 12) {
      ctx.globalAlpha = clamp(1 - (this.gameTime - 8) / 4, 0, 1);
      ctx.fillStyle = "rgba(0,200,255,0.7)";
      ctx.font = '11px "Share Tech Mono"';
      ctx.textAlign = "left";
      const hints = [
        "MOVE: A/D  JUMP: Space  ATTACK: X  HEAVY: V  PARRY: Shift",
        "DASH: C  OVERRIDE: Q  INTERACT: F  PAUSE: Tab",
        "Up+Attack = Launch (if unlocked)",
      ];
      for (let i = 0; i < hints.length; i++) {
        ctx.fillText(hints[i], padding, this.viewH - 60 + i * 16);
      }
      ctx.globalAlpha = 1;
    }

    ctx.textAlign = "left";
  }

  private renderTitle(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = "#080018";
    ctx.fillRect(0, 0, this.viewW, this.viewH);

    // Animated background grid
    const t = Date.now() / 1000;
    ctx.strokeStyle = "rgba(0,100,200,0.1)";
    ctx.lineWidth = 1;
    for (let x = 0; x < this.viewW; x += 40) {
      const offset = Math.sin(t + x * 0.01) * 4;
      ctx.beginPath();
      ctx.moveTo(x + offset, 0);
      ctx.lineTo(x + offset, this.viewH);
      ctx.stroke();
    }

    // Title
    ctx.textAlign = "center";
    ctx.font = 'bold 48px "Orbitron"';
    const glitchOffset = Math.sin(t * 8) * 2;
    ctx.fillStyle = "#ff0044";
    ctx.fillText("GL1TCH", this.viewW / 2 - 3 + glitchOffset, this.viewH / 2 - 60);
    ctx.fillStyle = "#00ffff";
    ctx.fillText("GL1TCH", this.viewW / 2 + 3 - glitchOffset, this.viewH / 2 - 60);
    ctx.fillStyle = "#fff";
    ctx.fillText("GL1TCH", this.viewW / 2, this.viewH / 2 - 60);

    ctx.font = 'bold 32px "Orbitron"';
    ctx.fillStyle = "#00ddff";
    ctx.fillText("OVERRIDE 3.0", this.viewW / 2, this.viewH / 2 - 20);

    // Subtitle
    ctx.font = '14px "Share Tech Mono"';
    const blink = Math.sin(t * 3) > 0;
    if (blink) {
      ctx.fillStyle = "#00ff88";
      ctx.fillText("PRESS SPACE TO BOOT", this.viewW / 2, this.viewH / 2 + 30);
    }

    // Description
    ctx.fillStyle = "rgba(150,200,255,0.5)";
    ctx.font = '11px "Share Tech Mono"';
    const lines = [
      "SYSTEM ERROR DETECTED. CORRUPTION SPREADING.",
      "NAVIGATE THE DECODED SECTOR. EXPLOIT GLITCHES. EXECUTE THREATS.",
      "CHOOSE YOUR PROTOCOL: STABLE OR CORRUPTED.",
    ];
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], this.viewW / 2, this.viewH / 2 + 70 + i * 18);
    }

    // Scanlines
    this.glitch.render(ctx, this.viewW, this.viewH, false);
    ctx.textAlign = "left";
  }

  private renderGameOver(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(0, 0, this.viewW, this.viewH);

    ctx.textAlign = "center";
    ctx.font = 'bold 40px "Orbitron"';
    ctx.fillStyle = "#ff0044";
    ctx.fillText("SYSTEM FAILURE", this.viewW / 2, this.viewH / 2 - 30);

    ctx.font = '14px "Share Tech Mono"';
    ctx.fillStyle = "#ff6688";
    ctx.fillText(`FRAGMENTS COLLECTED: ${this.store.fragments}`, this.viewW / 2, this.viewH / 2 + 10);
    ctx.fillText(`ENEMIES EXECUTED: ${this.kills}`, this.viewW / 2, this.viewH / 2 + 30);

    const blink = Math.sin(Date.now() / 200) > 0;
    if (blink) {
      ctx.fillStyle = "#00ffff";
      ctx.fillText("PRESS SPACE TO REBOOT", this.viewW / 2, this.viewH / 2 + 70);
    }

    ctx.textAlign = "left";
  }

  private renderPaused(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(0, 0, this.viewW, this.viewH);
    ctx.textAlign = "center";
    ctx.font = 'bold 32px "Orbitron"';
    ctx.fillStyle = "#00ddff";
    ctx.fillText("PAUSED", this.viewW / 2, this.viewH / 2);
    ctx.font = '14px "Share Tech Mono"';
    ctx.fillStyle = "rgba(150,200,255,0.7)";
    ctx.fillText("Press Tab to resume", this.viewW / 2, this.viewH / 2 + 30);
    ctx.textAlign = "left";
  }

  private renderUpgradeScreen(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = "rgba(0,5,20,0.85)";
    ctx.fillRect(0, 0, this.viewW, this.viewH);

    ctx.textAlign = "center";
    ctx.font = 'bold 24px "Orbitron"';
    ctx.fillStyle = "#00ff88";
    ctx.fillText("UPGRADE TERMINAL", this.viewW / 2, 40);

    ctx.font = '14px "Share Tech Mono"';
    ctx.fillStyle = "#00ff88";
    ctx.fillText(`CODE FRAGMENTS: ${this.store.fragments}`, this.viewW / 2, 65);

    ctx.textAlign = "left";
    const startY = 90;
    const lineH = 42;
    for (let i = 0; i < UPGRADE_OPTIONS.length; i++) {
      const opt = UPGRADE_OPTIONS[i];
      const y = startY + i * lineH;
      const purchased = this.store.isPurchased(opt.id);
      const canAfford = this.store.canAfford(opt);

      ctx.fillStyle = purchased ? "rgba(60,60,60,0.5)" : canAfford ? "rgba(0,40,20,0.8)" : "rgba(40,0,0,0.6)";
      ctx.fillRect(100, y, this.viewW - 200, lineH - 6);
      ctx.strokeStyle = purchased ? "#444" : canAfford ? "#00ff88" : "#ff4444";
      ctx.lineWidth = 1;
      ctx.strokeRect(100, y, this.viewW - 200, lineH - 6);

      ctx.font = '12px "Share Tech Mono"';
      ctx.fillStyle = purchased ? "#666" : canAfford ? "#00ff88" : "#ff6666";
      ctx.fillText(`[${i + 1}] ${opt.name}`, 116, y + 16);
      ctx.fillStyle = purchased ? "#555" : "rgba(180,200,220,0.7)";
      ctx.font = '10px "Share Tech Mono"';
      ctx.fillText(opt.description, 116, y + 30);

      ctx.textAlign = "right";
      ctx.font = '12px "Share Tech Mono"';
      ctx.fillStyle = purchased ? "#555" : canAfford ? "#00ff88" : "#ff4444";
      ctx.fillText(purchased ? "INSTALLED" : `${opt.cost} CODE`, this.viewW - 116, y + 22);
      ctx.textAlign = "left";
    }

    ctx.textAlign = "center";
    ctx.font = '11px "Share Tech Mono"';
    ctx.fillStyle = "rgba(150,200,255,0.5)";
    ctx.fillText("Press number keys to install. Press Tab or Esc to exit.", this.viewW / 2, this.viewH - 20);
    ctx.textAlign = "left";
  }
}
