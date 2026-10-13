import { Rect, RenderMode } from "./types";

export interface TileLayer {
  data: number[];
  // If true, tiles in this layer are solid for collision
  solid: boolean;
  // In wireframe mode, this layer's collision is disabled
  wireframeDisableCollision: boolean;
  // Only visible in specific render modes (null = always visible)
  visibleInMode: RenderMode | null;
}

export interface LevelData {
  width: number;
  height: number;
  tileSize: number;
  layers: TileLayer[];
  // Spawn points for enemies
  enemySpawns: { x: number; y: number; type: string }[];
  // Hazard rects (lava, spikes, etc.)
  hazards: Rect[];
  // Moving platform data
  movingPlatforms: {
    x: number; y: number; w: number; h: number;
    range: number; speed: number; axis: "x" | "y";
  }[];
  // Upgrade terminal positions
  terminals: { x: number; y: number }[];
  // Player spawn
  playerSpawn: { x: number; y: number };
  // World bounds
  bounds: Rect;
}

// Tile codes:
// 0 = empty
// 1 = solid block (normal mode)
// 2 = platform (one-way, jump-through)
// 3 = wireframe-only block (visible only in wireframe mode, solid only in wireframe mode)
// 4 = solid block that becomes non-solid in wireframe mode
// 5 = decorative tile (background)
// 6 = laser grid (hazard, only active in wireframe mode)

export function createTestLevel(): LevelData {
  const tileSize = 32;
  const width = 60;
  const height = 20;

  // Background layer (decorative)
  const bg = new Array(width * height).fill(0);
  // Main collision layer
  const main = new Array(width * height).fill(0);
  // Wireframe layer (tiles only visible/solid in wireframe mode)
  const wf = new Array(width * height).fill(0);

  const set = (layer: number[], tx: number, ty: number, val: number) => {
    if (tx >= 0 && tx < width && ty >= 0 && ty < height) {
      layer[ty * width + tx] = val;
    }
  };

  // Floor
  for (let x = 0; x < width; x++) {
    set(main, x, height - 1, 1);
    set(main, x, height - 2, 1);
  }

  // Left and right walls
  for (let y = 0; y < height; y++) {
    set(main, 0, y, 1);
    set(main, width - 1, y, 1);
  }

  // Ceiling
  for (let x = 0; x < width; x++) {
    set(main, x, 0, 1);
  }

  // Platform sections
  // Section 1: low platforms
  for (let x = 4; x <= 8; x++) set(main, x, 15, 2);
  for (let x = 10; x <= 14; x++) set(main, x, 13, 2);
  for (let x = 16; x <= 20; x++) set(main, x, 11, 2);

  // Section 2: elevated area with wireframe-only platforms
  for (let x = 24; x <= 28; x++) set(main, x, 12, 2);
  // Wireframe-only platform (hidden passage)
  for (let x = 30; x <= 34; x++) set(wf, x, 10, 3);
  for (let x = 36; x <= 40; x++) set(main, x, 9, 2);

  // Section 3: walls that become passable in wireframe
  for (let y = 5; y <= 16; y++) set(main, 22, y, 4); // solid normally, passable in wireframe

  // Section 4: higher platforms
  for (let x = 42; x <= 46; x++) set(main, x, 8, 2);
  for (let x = 44; x <= 48; x++) set(main, x, 6, 2);

  // Section 5: upper area
  for (let x = 50; x <= 56; x++) set(main, x, 5, 2);
  for (let x = 52; x <= 54; x++) set(main, x, 3, 2);

  // Wireframe-only upper route
  for (let x = 38; x <= 42; x++) set(wf, x, 4, 3);

  // Background decorations
  for (let x = 2; x < width - 2; x += 3) {
    set(bg, x, height - 3, 5);
    set(bg, x + 1, height - 3, 5);
  }

  // Hazards (lava pits)
  const hazards: Rect[] = [
    { x: 15 * tileSize, y: (height - 3) * tileSize, w: 1 * tileSize, h: 1 * tileSize },
    { x: 26 * tileSize, y: (height - 3) * tileSize, w: 2 * tileSize, h: 1 * tileSize },
  ];

  // Moving platforms
  const movingPlatforms = [
    { x: 18 * tileSize, y: 14 * tileSize, w: 2 * tileSize, h: 0.5 * tileSize, range: 3 * tileSize, speed: 60, axis: "y" as const },
    { x: 38 * tileSize, y: 7 * tileSize, w: 2 * tileSize, h: 0.5 * tileSize, range: 4 * tileSize, speed: 50, axis: "x" as const },
    { x: 48 * tileSize, y: 4 * tileSize, w: 2 * tileSize, h: 0.5 * tileSize, range: 4 * tileSize, speed: 55, axis: "x" as const },
  ];

  // Enemy spawns
  const enemySpawns = [
    { x: 6 * tileSize, y: 13 * tileSize, type: "walker" },
    { x: 12 * tileSize, y: 11 * tileSize, type: "walker" },
    { x: 20 * tileSize, y: 9 * tileSize, type: "shooter" },
    { x: 32 * tileSize, y: 8 * tileSize, type: "walker" },
    { x: 44 * tileSize, y: 6 * tileSize, type: "shooter" },
    { x: 52 * tileSize, y: 3 * tileSize, type: "walker" },
    { x: 38 * tileSize, y: 16 * tileSize, type: "hazard" },
    { x: 50 * tileSize, y: 16 * tileSize, type: "hazard" },
    { x: 56 * tileSize, y: (height - 5) * tileSize, type: "boss" },
  ];

  // Terminals (upgrade stations)
  const terminals = [
    { x: 3 * tileSize, y: (height - 4) * tileSize },
    { x: 54 * tileSize, y: 2 * tileSize },
  ];

  return {
    width,
    height,
    tileSize,
    layers: [
      { data: bg, solid: false, wireframeDisableCollision: false, visibleInMode: null },
      { data: main, solid: true, wireframeDisableCollision: false, visibleInMode: null },
      { data: wf, solid: true, wireframeDisableCollision: false, visibleInMode: "wireframe" },
    ],
    enemySpawns,
    hazards,
    movingPlatforms,
    terminals,
    playerSpawn: { x: 3 * tileSize, y: (height - 5) * tileSize },
    bounds: { x: 0, y: 0, w: width * tileSize, h: height * tileSize },
  };
}

export function getTile(level: LevelData, layerIdx: number, tx: number, ty: number): number {
  if (tx < 0 || tx >= level.width || ty < 0 || ty >= level.height) return 0;
  return level.layers[layerIdx].data[ty * level.width + tx];
}

export function isTileSolid(tile: number): boolean {
  return tile === 1 || tile === 3 || tile === 4;
}

export function isTileOneWay(tile: number): boolean {
  return tile === 2;
}

export function isTileWireframePassable(tile: number): boolean {
  return tile === 4; // becomes non-solid in wireframe mode
}

export function isTileWireframeOnly(tile: number): boolean {
  return tile === 3;
}

export function isTileLaserGrid(tile: number): boolean {
  return tile === 6;
}

/**
 * Returns all solid collision rects for the current render mode.
 * In wireframe mode, tile 4 becomes non-solid, and tile 3 becomes solid.
 */
export function getCollisionRects(level: LevelData, mode: RenderMode): Rect[] {
  const rects: Rect[] = [];
  const ts = level.tileSize;

  // Main layer
  for (let y = 0; y < level.height; y++) {
    for (let x = 0; x < level.width; x++) {
      const tile = level.layers[1].data[y * level.width + x];
      if (tile === 0) continue;

      if (tile === 1) {
        rects.push({ x: x * ts, y: y * ts, w: ts, h: ts });
      } else if (tile === 4) {
        if (mode === "normal") {
          rects.push({ x: x * ts, y: y * ts, w: ts, h: ts });
        }
        // In wireframe mode, tile 4 is passable
      }
      // tile 2 (one-way) is handled separately
    }
  }

  // Wireframe-only layer
  if (mode === "wireframe") {
    for (let y = 0; y < level.height; y++) {
      for (let x = 0; x < level.width; x++) {
        const tile = level.layers[2].data[y * level.width + x];
        if (tile === 3) {
          rects.push({ x: x * ts, y: y * ts, w: ts, h: ts });
        }
      }
    }
  }

  return rects;
}

export function getOneWayRects(level: LevelData): Rect[] {
  const rects: Rect[] = [];
  const ts = level.tileSize;
  for (let y = 0; y < level.height; y++) {
    for (let x = 0; x < level.width; x++) {
      const tile = level.layers[1].data[y * level.width + x];
      if (tile === 2) {
        rects.push({ x: x * ts, y: y * ts, w: ts, h: ts });
      }
    }
  }
  return rects;
}
