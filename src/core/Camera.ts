import { clamp } from "./utils";

export class Camera {
  x: number = 0;
  y: number = 0;
  viewW: number = 960;
  viewH: number = 540;
  zoom: number = 1;

  // Shake
  private shakeTime: number = 0;
  private shakeIntensity: number = 0;
  private shakeX: number = 0;
  private shakeY: number = 0;

  // Hit-stop
  private freezeTime: number = 0;

  shake(intensity: number, duration: number) {
    if (intensity > this.shakeIntensity || this.shakeTime <= 0) {
      this.shakeIntensity = intensity;
    }
    this.shakeTime = Math.max(this.shakeTime, duration);
  }

  hitStop(duration: number) {
    this.freezeTime = Math.max(this.freezeTime, duration);
  }

  get isFrozen(): boolean {
    return this.freezeTime > 0;
  }

  update(dt: number, targetX: number, targetY: number, worldW: number, worldH: number) {
    if (this.freezeTime > 0) {
      this.freezeTime -= dt;
      return;
    }

    const lookAheadX = 80;
    const targetCamX = targetX - this.viewW / 2 / this.zoom + lookAheadX;
    const targetCamY = targetY - this.viewH / 2 / this.zoom;

    this.x += (targetCamX - this.x) * 0.1;
    this.y += (targetCamY - this.y) * 0.1;

    this.x = clamp(this.x, 0, Math.max(0, worldW - this.viewW / this.zoom));
    this.y = clamp(this.y, 0, Math.max(0, worldH - this.viewH / this.zoom));

    if (this.shakeTime > 0) {
      this.shakeTime -= dt;
      const factor = this.shakeTime > 0 ? this.shakeTime : 0;
      this.shakeX = (Math.random() - 0.5) * this.shakeIntensity * factor * 2;
      this.shakeY = (Math.random() - 0.5) * this.shakeIntensity * factor * 2;
      if (this.shakeTime <= 0) {
        this.shakeIntensity = 0;
        this.shakeX = 0;
        this.shakeY = 0;
      }
    }
  }

  get renderX(): number { return this.x + this.shakeX; }
  get renderY(): number { return this.y + this.shakeY; }

  worldToScreen(wx: number, wy: number): [number, number] {
    return [
      (wx - this.renderX) * this.zoom,
      (wy - this.renderY) * this.zoom,
    ];
  }
}
