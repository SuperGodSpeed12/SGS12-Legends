export class Input {
  private keys: Record<string, boolean> = {};
  private queuedPressed: Set<string> = new Set();
  private justPressedSet: Set<string> = new Set();

  // Buffered action tracking
  public jumpBuffered: number = 0; // seconds remaining
  public attackBuffered: number = 0;
  public dashBuffered: number = 0;
  public parryBuffered: number = 0;

  constructor() {
    window.addEventListener("keydown", (e) => this.onKeyDown(e));
    window.addEventListener("keyup", (e) => this.onKeyUp(e));
    window.addEventListener("gamepadconnected", () => {});
    window.addEventListener("gamepaddisconnected", () => {});
  }

  private onKeyDown(e: KeyboardEvent) {
    const code = e.code;
    if (!this.keys[code]) {
      this.queuedPressed.add(code);
    }
    this.keys[code] = true;

    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(code)) {
      e.preventDefault();
    }
  }

  private onKeyUp(e: KeyboardEvent) {
    this.keys[e.code] = false;
  }

  update(dt: number) {
    this.justPressedSet = this.queuedPressed;
    this.queuedPressed = new Set();

    // Buffer inputs
    if (this.justPressedSet.has("Space") || this.justPressedSet.has("KeyZ") || this.justPressedSet.has("GamepadA")) {
      this.jumpBuffered = 0.12;
    }
    if (this.justPressedSet.has("KeyX") || this.justPressedSet.has("GamepadX")) {
      this.attackBuffered = 0.12;
    }
    if (this.justPressedSet.has("KeyC") || this.justPressedSet.has("GamepadB")) {
      this.dashBuffered = 0.12;
    }
    if (this.justPressedSet.has("ShiftLeft") || this.justPressedSet.has("ShiftRight") || this.justPressedSet.has("GamepadLB")) {
      this.parryBuffered = 0.12;
    }

    this.jumpBuffered = Math.max(0, this.jumpBuffered - dt);
    this.attackBuffered = Math.max(0, this.attackBuffered - dt);
    this.dashBuffered = Math.max(0, this.dashBuffered - dt);
    this.parryBuffered = Math.max(0, this.parryBuffered - dt);
  }

  isDown(code: string): boolean {
    return !!this.keys[code];
  }

  justPressed(code: string): boolean {
    return this.justPressedSet.has(code);
  }

  // Convenience getters
  get left(): boolean {
    return this.isDown("ArrowLeft") || this.isDown("KeyA");
  }
  get right(): boolean {
    return this.isDown("ArrowRight") || this.isDown("KeyD");
  }
  get up(): boolean {
    return this.isDown("ArrowUp") || this.isDown("KeyW");
  }
  get down(): boolean {
    return this.isDown("ArrowDown") || this.isDown("KeyS");
  }
  get jumpHeld(): boolean {
    return this.isDown("Space") || this.isDown("KeyZ");
  }
  get jumpQueued(): boolean {
    return this.jumpBuffered > 0;
  }
  get attackQueued(): boolean {
    return this.attackBuffered > 0;
  }
  get dashQueued(): boolean {
    return this.dashBuffered > 0;
  }
  get parryQueued(): boolean {
    return this.parryBuffered > 0;
  }
  get overrideQueued(): boolean {
    return this.justPressed("KeyQ") || this.justPressed("GamepadY");
  }
  get saveStateQueued(): boolean {
    return this.justPressed("KeyE") || this.justPressed("GamepadRB");
  }
  get rewindQueued(): boolean {
    return this.justPressed("KeyR") || this.justPressed("GamepadLT");
  }
  get interactQueued(): boolean {
    return this.justPressed("KeyF") || this.justPressed("GamepadA");
  }
  get menuToggle(): boolean {
    return this.justPressed("Tab") || this.justPressed("Escape");
  }

  consumeJump() { this.jumpBuffered = 0; }
  consumeAttack() { this.attackBuffered = 0; }
  consumeDash() { this.dashBuffered = 0; }
  consumeParry() { this.parryBuffered = 0; }
}
