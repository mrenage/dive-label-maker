export function normalizeGas(g: string): string {
  const s = g.trim().toUpperCase();
  if (s === "O2") return "100";
  return s;
}

export function parseFO2(gasRaw: string): number {
  const gas = normalizeGas(gasRaw);

  // "32" or "21" or "100"
  if (/^\d+(\.\d+)?$/.test(gas)) {
    const val = Number(gas);
    if (val <= 0 || val > 100) throw new Error(`Invalid gas percent: ${gasRaw}`);
    return val / 100;
  }

  // "21/35"
  if (/^\d+(\.\d+)?\/\d+(\.\d+)?$/.test(gas)) {
    const [o2] = gas.split("/");
    const val = Number(o2);
    if (val <= 0 || val > 100) throw new Error(`Invalid gas: ${gasRaw}`);
    return val / 100;
  }

  // "TX18/45"
  const tx = gas.match(/^TX(\d+(\.\d+)?)\/(\d+(\.\d+)?)$/);
  if (tx) {
    const o2 = Number(tx[1]);
    if (o2 <= 0 || o2 > 100) throw new Error(`Invalid trimix O2: ${gasRaw}`);
    return o2 / 100;
  }

  throw new Error(`Unrecognized gas format: ${gasRaw}`);
}
