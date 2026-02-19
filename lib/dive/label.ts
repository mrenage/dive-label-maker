export function buildLabelText(args: {
  maxDepthM: number;
  totalRuntimeMin: number;
  gasesCarried: string[];
  modByGasM: Record<string, number>;
  schedule: Array<{ depthM: number; stopMin: number; trtMin: number; gas: string }>;
  gradientFactors?: { low: number; high: number };
  otuTotal: number;
  cnsPercentTotal: number;
  gasUsedLitresByGas: Record<string, number>;
  notes?: string;
  banner?: string;
}): string {
  const gf = args.gradientFactors ? ` | GF ${args.gradientFactors.low}/${args.gradientFactors.high}` : "";
  const header = `MAX ${args.maxDepthM}m | RT ${args.totalRuntimeMin}m${gf}`;

  const gases = `GASES: ${args.gasesCarried.join(" | ")}`;
  const mods = Object.entries(args.modByGasM)
    .map(([g, m]) => `${g}=${Math.round(m)}m`)
    .join(", ");
  const modLine = `MOD@deco: ${mods}`;

  const stops = args.schedule
    .map(r => `${String(r.depthM).padStart(2, " ")}m  ${String(r.stopMin).padStart(2, " ")}'  TRT${String(r.trtMin).padStart(2, " ")}  ${r.gas}`)
    .join("\n");

  const expo = `OTU ${Math.round(args.otuTotal)} | CNS ${Math.round(args.cnsPercentTotal)}%`;
  const gasUse = `GAS(L): ${Object.entries(args.gasUsedLitresByGas).map(([g, l]) => `${g}=${Math.round(l)}`).join(" | ")}`;
  const safety = `VERIFY AGAINST YOUR TRAINING + PLANNER. NOT A DIVE PLAN GENERATOR.`;

  const banner = args.banner ? `*** ${args.banner} ***\n` : "";
  const notes = args.notes ? `NOTES: ${args.notes}\n` : "";

  return [
    banner + header,
    gases,
    modLine,
    "---- STOPS ----",
    stops,
    "--------------",
    expo,
    gasUse,
    notes + safety,
  ].join("\n");
}
