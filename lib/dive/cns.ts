const NOAA: Array<{ ppo2: number; minutes: number }> = [
  { ppo2: 0.5, minutes: Infinity },
  { ppo2: 0.6, minutes: 720 },
  { ppo2: 0.7, minutes: 570 },
  { ppo2: 0.8, minutes: 450 },
  { ppo2: 0.9, minutes: 360 },
  { ppo2: 1.0, minutes: 300 },
  { ppo2: 1.1, minutes: 240 },
  { ppo2: 1.2, minutes: 210 },
  { ppo2: 1.3, minutes: 180 },
  { ppo2: 1.4, minutes: 150 },
  { ppo2: 1.5, minutes: 120 },
  { ppo2: 1.6, minutes: 45 },
];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function allowedMinutesAtPPO2(ppo2: number): number {
  if (ppo2 <= 0.5) return Infinity;
  if (ppo2 >= 1.6) return 45;

  for (let i = 0; i < NOAA.length - 1; i++) {
    const lo = NOAA[i];
    const hi = NOAA[i + 1];
    if (ppo2 >= lo.ppo2 && ppo2 <= hi.ppo2) {
      if (!isFinite(lo.minutes)) return hi.minutes;
      const t = (ppo2 - lo.ppo2) / (hi.ppo2 - lo.ppo2);
      return lerp(lo.minutes, hi.minutes, t);
    }
  }
  return 45;
}

export function cnsPercentForSegment(ppo2: number, minutes: number): number {
  if (minutes <= 0) return 0;
  const allowed = allowedMinutesAtPPO2(ppo2);
  if (!isFinite(allowed)) return 0;
  return (minutes / allowed) * 100;
}
