import { seededRandom } from './DifficultyManager';
import { loadProfile, saveProfile, addSyrup, type MissionState } from './ProfileStore';
import { track } from '../utils/analytics';

export interface MissionDef {
  id: string;
  label: (target: number) => string;
  targets: number[];
  reward: number;
}

export const MISSION_DEFS: MissionDef[] = [
  { id: 'perfects', label: (t) => `Land ${t} perfects in one run`, targets: [3, 5, 8], reward: 15 },
  { id: 'triple', label: () => `Land a triple flip`, targets: [1], reward: 12 },
  { id: 'reach', label: (t) => `Reach ${t} pancakes`, targets: [10, 15, 20, 25], reward: 15 },
  { id: 'wind', label: (t) => `Land ${t} pancakes in the wind`, targets: [3, 5], reward: 18 },
  { id: 'lowlean', label: () => `Finish a 5+ run with lean under 30px`, targets: [1], reward: 20 },
];

export interface LandingObservation {
  perfect: boolean;
  rotations: number;
  windActive: boolean;
  height: number;
}

export function defOf(id: string): MissionDef {
  return MISSION_DEFS.find((d) => d.id === id) ?? MISSION_DEFS[0];
}

export function missionLabel(state: MissionState): string {
  return defOf(state.id).label(state.target);
}

/** Ensure the player always has 3 active missions (seeded per day). */
export function ensureMissions(daySeed: number): MissionState[] {
  const p = loadProfile();
  let guard = 0;
  while (p.missions.length < 3 && guard++ < 20) {
    const idx = Math.floor(seededRandom(daySeed * 77 + p.missionSeedCounter * 13 + 5) * MISSION_DEFS.length);
    const def = MISSION_DEFS[idx % MISSION_DEFS.length];
    p.missionSeedCounter++;
    if (p.missions.some((m) => m.id === def.id)) continue;
    const tier = Math.floor(seededRandom(daySeed + p.missionSeedCounter * 29 + 3) * def.targets.length);
    p.missions.push({ id: def.id, progress: 0, target: def.targets[tier % def.targets.length] });
  }
  saveProfile(p);
  return p.missions;
}

/** Observe a landing; returns ids of missions completed by it. */
export function observeLanding(obs: LandingObservation): string[] {
  const p = loadProfile();
  const completed: string[] = [];
  for (const m of p.missions) {
    if (m.id === 'perfects' && obs.perfect) m.progress = Math.min(m.target, m.progress + 1);
    if (m.id === 'triple' && obs.rotations >= 3) m.progress = Math.min(m.target, m.progress + 1);
    if (m.id === 'reach') m.progress = Math.max(m.progress, Math.min(m.target, obs.height));
    if (m.id === 'wind' && obs.windActive) m.progress = Math.min(m.target, m.progress + 1);
    if (m.progress >= m.target) completed.push(m.id);
  }
  saveProfile(p);
  finishCompletions(completed);
  return completed;
}

export function observeRunEnd(height: number, lean: number): string[] {
  const p = loadProfile();
  const completed: string[] = [];
  for (const m of p.missions) {
    if (m.id === 'lowlean' && height >= 5 && Math.abs(lean) < 30) {
      m.progress = m.target;
      completed.push(m.id);
    }
    if (m.id === 'reach' && m.progress >= m.target) completed.push(m.id);
  }
  saveProfile(p);
  finishCompletions(completed);
  return completed;
}

function finishCompletions(ids: string[]): void {
  if (ids.length === 0) return;
  const p = loadProfile();
  for (const id of ids) {
    addSyrup(defOf(id).reward);
    track('mission_complete', { mission: id, reward: defOf(id).reward });
    p.missions = p.missions.filter((m) => m.id !== id);
  }
  saveProfile(p);
}

/** Lines for the Game Over screen: completions + active progress. */
export function missionSummaryLines(completedIds: string[]): string[] {
  const p = loadProfile();
  const lines: string[] = [];
  for (const id of completedIds) {
    const def = defOf(id);
    lines.push(`✅ ${def.label(def.targets[0])} (+${def.reward}🍯)`);
  }
  for (const m of p.missions.slice(0, 2)) {
    lines.push(`🎯 ${missionLabel(m)} — ${m.progress}/${m.target}`);
  }
  return lines;
}
