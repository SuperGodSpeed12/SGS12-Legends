export class GlitchFX {
  private scanlineOffset: number = 0;
  private rgbSplitAmount: number = 0;
  private rgbSplitTimer: number = 0;
  private glitchBarTimer: number = 0;
  private glitchBarY: number = 0;
  private glitchBarH: number = 0;
  private noiseIntensity: number = 0;

  triggerRGBSplit(amount: number, duration: number) {
    this.rgbSplitAmount = Math.max(this.rgbSplitAmount, amount);
    this.rgbSplitTimer = Math.max(this.rgbSplitTimer, duration);
  }

  triggerGlitchBar(duration: number = 0.15) {
    this.glitchBarTimer = duration;
    this.glitchBarY = Math.random() * 540;
    this.glitchBarH = 10 + Math.random() * 30;
  }

  setNoise(intensity: number) {
    this.noiseIntensity = intensity;
  }

  update(dt: number) {
    this.scanlineOffset += dt * 60;
    if (this.rgbSplitTimer > 0) {
      this.rgbSplitTimer -= dt;
      if (this.rgbSplitTimer <= 0) this.rgbSplitAmount = 0;
    }
    if (this.glitchBarTimer > 0) {
      this.glitchBarTimer -= dt;
    }
  }

  render(ctx: CanvasRenderingContext2D, w: number, h: number, overrideActive: boolean) {
    // Scanlines
    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = "#000";
    const offset = Math.floor(this.scanlineOffset) % 4;
    for (let y = offset; y < h; y += 4) {
      ctx.fillRect(0, y, w, 2);
    }
    ctx.restore();

    // RGB split
    if (this.rgbSplitAmount > 0) {
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = "#ff0000";
      ctx.fillRect(-this.rgbSplitAmount, 0, w, h);
      ctx.fillStyle = "#00ffff";
      ctx.fillRect(this.rgbSplitAmount, 0, w, h);
      ctx.restore();
    }

    // Glitch bar
    if (this.glitchBarTimer > 0) {
      ctx.save();
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, this.glitchBarY, w, this.glitchBarH);
      // Color displacement bar
      ctx.globalCompositeOperation = "screen";
      ctx.fillStyle = "#ff0000";
      ctx.fillRect(-4, this.glitchBarY, w, this.glitchBarH);
      ctx.fillStyle = "#0000ff";
      ctx.fillRect(4, this.glitchBarY, w, this.glitchBarH);
      ctx.restore();
    }

    // Override tint
    if (overrideActive) {
      ctx.save();
      ctx.globalAlpha = 0.05 + Math.sin(Date.now() / 100) * 0.02;
      ctx.fillStyle = "#00ff88";
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    // Noise
    if (this.noiseIntensity > 0) {
      ctx.save();
      ctx.globalAlpha = this.noiseIntensity;
      for (let i = 0; i < 20; i++) {
        const nx = Math.random() * w;
        const ny = Math.random() * h;
        ctx.fillStyle = Math.random() > 0.5 ? "#fff" : "#000";
        ctx.fillRect(nx, ny, 2, 2);
      }
      ctx.restore();
    }

    // Vignette
    const grad = ctx.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, h * 0.7);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(1, "rgba(0,0,0,0.5)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }
}
