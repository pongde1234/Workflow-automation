import { seeded } from '@/lib/util';

/*
 * Simulated recent readings for the sample devices, so a Device alert can show
 * how a reading has behaved before you pick its limit. Deterministic for a
 * device, reading and day; nothing here talks to real equipment.
 */

/** How a reading tends to move: its level, the swing over a working day, noise, and how often it spikes. */
interface Profile { base: number; swing: number; noise: number; spike: number; spikeChance: number; decimals: number; drift?: number }

const PROFILES: Record<string, Profile> = {
  'd_comp3:temperature': { base: 78, swing: 6, noise: 1.6, spike: 9, spikeChance: 0.04, decimals: 1 },
  'd_comp3:pressure': { base: 7.1, swing: 0.4, noise: 0.15, spike: 0.8, spikeChance: 0.03, decimals: 2 },
  'd_comp3:current': { base: 41, swing: 6, noise: 1.5, spike: 8, spikeChance: 0.03, decimals: 1 },
  'd_cnc07:spindle_temp': { base: 54, swing: 7, noise: 1.5, spike: 8, spikeChance: 0.03, decimals: 1 },
  'd_cnc07:vibration': { base: 5.2, swing: 0.9, noise: 0.35, spike: 2.4, spikeChance: 0.05, decimals: 2 },
  'd_incomer:power': { base: 1480, swing: 380, noise: 60, spike: 260, spikeChance: 0.04, decimals: 0 },
  'd_incomer:pf': { base: 0.93, swing: 0.03, noise: 0.01, spike: -0.06, spikeChance: 0.03, decimals: 2 },
  'd_chiller1:outlet_temp': { base: 10.4, swing: 1.6, noise: 0.3, spike: 1.4, spikeChance: 0.04, decimals: 1 },
  'd_boiler1:steam_pressure': { base: 9.7, swing: 0.5, noise: 0.15, spike: 1.1, spikeChance: 0.04, decimals: 2 },
  'd_boiler1:stack_temp': { base: 182, swing: 12, noise: 3, spike: 18, spikeChance: 0.03, decimals: 0 },
  'd_dg1:fuel_level': { base: 46, swing: 0, noise: 0.4, spike: 0, spikeChance: 0, decimals: 1, drift: -0.3 },
  'd_dg1:load': { base: 110, swing: 40, noise: 8, spike: 60, spikeChance: 0.03, decimals: 0 },
};

const STEP_MS = 15 * 60_000;
const DAY_MS = 86_400_000;

const hash = (s: string) => [...s].reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) | 0, 7);

/** Readings every 15 minutes over the last 24 hours, oldest first, or [] for a reading with no profile. */
export function recentReadings(deviceId: string, parameter: string, now: number): { t: number; v: number }[] {
  const p = PROFILES[`${deviceId}:${parameter}`];
  if (!p) return [];
  const end = Math.floor(now / STEP_MS) * STEP_MS;
  const start = end - DAY_MS + STEP_MS;
  const rnd = seeded(hash(`${deviceId}:${parameter}:${Math.floor(start / DAY_MS)}`) >>> 0);
  const out: { t: number; v: number }[] = [];
  for (let t = start, i = 0; t <= end; t += STEP_MS, i++) {
    const hour = new Date(t).getHours() + new Date(t).getMinutes() / 60;
    // Busiest mid-afternoon, quietest before dawn.
    const shape = Math.sin(((hour - 9) / 24) * 2 * Math.PI);
    const spike = rnd() < p.spikeChance ? p.spike * (0.6 + rnd() * 0.6) : 0;
    const v = p.base + p.swing * shape + (rnd() - 0.5) * 2 * p.noise + spike + (p.drift ?? 0) * i;
    out.push({ t, v: Number(v.toFixed(p.decimals)) });
  }
  return out;
}
