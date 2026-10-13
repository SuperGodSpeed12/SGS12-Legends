export interface Vec2 {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type RenderMode = "normal" | "wireframe";

export type EnemyState = "idle" | "patrol" | "chase" | "attack" | "staggered" | "dead";

export interface ParticleData {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  gravity: number;
}

export interface SaveStateSnapshot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  corruption: number;
  ammo: number;
}

export interface UpgradeNode {
  id: string;
  name: string;
  description: string;
  cost: number;
  purchased: boolean;
  effect: (p: any) => void;
}
