import { PlayerUpgrades } from "./Player";

export interface UpgradeOption {
  id: string;
  name: string;
  description: string;
  cost: number;
  apply: (u: PlayerUpgrades) => void;
}

export const UPGRADE_OPTIONS: UpgradeOption[] = [
  {
    id: "hp_boost",
    name: "HP BUFFER +25",
    description: "Increase max system integrity by 25.",
    cost: 3,
    apply: (u) => { u.maxHP += 25; },
  },
  {
    id: "atk_boost",
    name: "ATTACK OVERRIDE +10",
    description: "Increase melee damage by 10.",
    cost: 4,
    apply: (u) => { u.attackDamage += 10; },
  },
  {
    id: "atk_range",
    name: "ATTACK RANGE +16",
    description: "Extend melee reach by 16 pixels.",
    cost: 3,
    apply: (u) => { u.attackRange += 16; },
  },
  {
    id: "speed_boost",
    name: "MOVE SPEED +30",
    description: "Increase movement speed by 30.",
    cost: 3,
    apply: (u) => { u.moveSpeed += 30; },
  },
  {
    id: "dash_cd",
    name: "DASH CDR -0.15s",
    description: "Reduce dash cooldown by 0.15s.",
    cost: 5,
    apply: (u) => { u.dashCooldown = Math.max(0.3, u.dashCooldown - 0.15); },
  },
  {
    id: "jump_boost",
    name: "JUMP POWER +40",
    description: "Increase jump height.",
    cost: 3,
    apply: (u) => { u.jumpPower += 40; },
  },
  {
    id: "ammo_boost",
    name: "MEMORY CAPACITY +10",
    description: "Increase max ammo by 10.",
    cost: 3,
    apply: (u) => { u.maxAmmo += 10; },
  },
  {
    id: "save_state",
    name: "SAVE STATE PROTOCOL",
    description: "Unlock: Drop a save state and rewind to it. E = drop, R = rewind.",
    cost: 8,
    apply: (u) => { u.hasSaveState = true; },
  },
  {
    id: "corruption_cap",
    name: "CORRUPTION BUFFER +25",
    description: "Increase max corruption gauge by 25.",
    cost: 4,
    apply: (u) => { u.maxCorruption += 25; },
  },
  {
    id: "launcher",
    name: "LAUNCHER PROTOCOL",
    description: "Unlock: Up + Attack launches enemies airborne for juggling.",
    cost: 6,
    apply: (u) => { u.hasLauncher = true; },
  },
  {
    id: "stamina_boost",
    name: "STAMINA BUFFER +30",
    description: "Increase max stamina by 30.",
    cost: 3,
    apply: (u) => { u.maxStamina += 30; },
  },
];

export class UpgradeStore {
  purchased: Set<string> = new Set();
  fragments: number = 0;

  canAfford(option: UpgradeOption): boolean {
    return this.fragments >= option.cost && !this.purchased.has(option.id);
  }

  purchase(option: UpgradeOption, upgrades: PlayerUpgrades): boolean {
    if (!this.canAfford(option)) return false;
    this.fragments -= option.cost;
    this.purchased.add(option.id);
    option.apply(upgrades);
    return true;
  }

  isPurchased(id: string): boolean {
    return this.purchased.has(id);
  }
}
