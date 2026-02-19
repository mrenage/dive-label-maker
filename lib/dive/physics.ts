export function ataAtDepth(depthM: number): number {
  return depthM / 10 + 1;
}

export function ppo2AtDepth(fo2: number, depthM: number): number {
  return fo2 * ataAtDepth(depthM);
}

export function modForFO2(fo2: number, ppo2Limit: number): number {
  return (ppo2Limit / fo2 - 1) * 10;
}
