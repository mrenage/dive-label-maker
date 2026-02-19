export function otuForSegment(ppo2: number, minutes: number): number {
  if (minutes <= 0 || ppo2 <= 0.5) return 0;
  return minutes * Math.pow((ppo2 - 0.5) / 0.5, 0.83);
}
