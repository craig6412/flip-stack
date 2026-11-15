import { STORAGE_KEYS } from '../config';

/**
 * Player profile: syrup currency, owned/equipped cosmetics, mission state.
 * localStorage now; shaped so it can move to cloud / Capacitor Preferences
 * later without changing callers.
 */
export interface MissionState {
  id: string;
  progress: number;
  target: number;
}

export interface Profile {
  syrup: number;
  owned: string[];
  equipped: { pan: string; pancake: string; plate: string; bg: string };
  missions: MissionState[];
  missionSeedCounter: number;
  totalRuns: number;
  totalPancakes: number;
}

const DEFAULT_PROFILE: Profile = {
  syrup: 0,
  owned: ['pan_classic', 'pancake_buttermilk', 'plate_diner', 'bg_diner'],
  equipped: { pan: 'pan_classic', pancake: 'pancake_buttermilk', plate: 'plate_diner', bg: 'bg_diner' },
  missions: [],
  missionSeedCounter: 0,
  totalRuns: 0,
  totalPancakes: 0,
};

let cache: Profile | null = null;

export function loadProfile(): Profile {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.PROFILE);
    cache = raw
      ? { ...DEFAULT_PROFILE, ...(JSON.parse(raw) as Partial<Profile>) }
      : structuredClone(DEFAULT_PROFILE);
  } catch {
    cache = structuredClone(DEFAULT_PROFILE);
  }
  return cache;
}

export function saveProfile(p: Profile = loadProfile()): void {
  cache = p;
  try {
    localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(p));
  } catch { /* ignore */ }
}

export function addSyrup(n: number): void {
  const p = loadProfile();
  p.syrup += n;
  saveProfile(p);
}
