import { ParticleData } from "./types";

export class ParticleSystem {
  private particles: ParticleData[] = [];
  private maxParticles: number = 500;

  spawn(x: number, y: number, vx: number, vy: number, life: number, color: string, size: number, gravity: number = 200) {
    if (this.particles.length >= this.maxParticles) {
      this.particles.shift();
    }
    this.particles.push({ x, y, vx, vy, life, maxLife: life, color, size, gravity });
  }

  burst(x: number, y: number, count: number, color: string, speed: number = 150, life: number = 0.4, size: number = 3, gravity: number = 200) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const s = speed * (0.5 + Math.random() * 0.8);
      this.spawn(x, y, Math.cos(angle) * s, Math.sin(angle) * s, life * (0.7 + Math.random() * 0.6), color, size, gravity);
    }
  }

  update(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.96;
    }
  }

  render(ctx: CanvasRenderingContext2D, camX: number, camY: number, zoom: number) {
    ctx.save();
    for (const p of this.particles) {
      const alpha = p.life / p.maxLife;
      const sx = (p.x - camX) * zoom;
      const sy = (p.y - camY) * zoom;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.fillRect(sx, sy, p.size, p.size);
    }
    ctx.restore();
  }

  clear() {
    this.particles.length = 0;
  }
}
