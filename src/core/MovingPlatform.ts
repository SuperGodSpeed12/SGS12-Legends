import { RenderMode } from "./types";
import { LevelData } from "./Level";

export class MovingPlatform {
  x: number;
  y: number;
  w: number;
  h: number;
  startX: number;
  startY: number;
  range: number;
  speed: number;
  axis: "x" | "y";
  phase: number = 0;
  deltaX: number = 0;
  deltaY: number = 0;
  carryPlayer: boolean = false;

  constructor(data: { x: number; y: number; w: number; h: number; range: number; speed: number; axis: "x" | "y" }) {
    this.x = data.x;
    this.y = data.y;
    this.w = data.w;
    this.h = data.h;
    this.startX = data.x;
    this.startY = data.y;
    this.range = data.range;
    this.speed = data.speed;
    this.axis = data.axis;
  }

  update(dt: number, _level: LevelData) {
    this.phase += this.speed * dt;
    const offset = Math.sin(this.phase * 0.01) * this.range;
    const prevX = this.x;
    const prevY = this.y;

    if (this.axis === "x") {
      this.x = this.startX + offset;
    } else {
      this.y = this.startY + offset;
    }

    this.deltaX = this.x - prevX;
    this.deltaY = this.y - prevY;
  }

  render(ctx: CanvasRenderingContext2D, camX: number, camY: number, zoom: number, mode: RenderMode) {
    const sx = (this.x - camX) * zoom;
    const sy = (this.y - camY) * zoom;
    const sw = this.w * zoom;
    const sh = this.h * zoom;

    if (mode === "wireframe") {
      ctx.strokeStyle = "#00ff44";
      ctx.lineWidth = 2;
      ctx.strokeRect(sx, sy, sw, sh);
    } else {
      ctx.fillStyle = "#3344aa";
      ctx.fillRect(sx, sy, sw, sh);
      ctx.strokeStyle = "#5577dd";
      ctx.lineWidth = 2;
      ctx.strokeRect(sx, sy, sw, sh);
      // Direction indicator
      ctx.fillStyle = "rgba(100,150,255,0.5)";
      if (this.axis === "x") {
        ctx.fillRect(sx + 4, sy + sh / 2 - 1, sw - 8, 2);
      } else {
        ctx.fillRect(sx + sw / 2 - 1, sy + 4, 2, sh - 8);
      }
    }
  }
}
