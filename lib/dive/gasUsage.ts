import { ataAtDepth } from "./physics";

export function litresUsed(sacLMin: number, depthM: number, minutes: number): number {
  return sacLMin * ataAtDepth(depthM) * minutes;
}
