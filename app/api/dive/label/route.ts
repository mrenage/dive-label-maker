import { NextResponse } from "next/server";
import { z } from "zod";
import { normalizeGas, parseFO2 } from "@/lib/dive/parseGas";
import { modForFO2, ppo2AtDepth } from "@/lib/dive/physics";
import { otuForSegment } from "@/lib/dive/otu";
import { cnsPercentForSegment } from "@/lib/dive/cns";
import { litresUsed } from "@/lib/dive/gasUsage";
import { buildLabelText } from "@/lib/dive/label";
import type { DiveLabelResponse } from "@/lib/dive/types";

const Row = z.object({
  depthM: z.number().nonnegative(),
  stopMin: z.number().int().positive(),
  trtMin: z.number().int().positive(),
  gas: z.string().min(1),
});

const Req = z.object({
  maxDepthM: z.number().positive(),
  gasesCarried: z.array(z.string().min(1)).min(1),
  ppo2: z.object({ working: z.number().positive(), deco: z.number().positive() }),
  sac: z.object({ workingLMin: z.number().positive(), decoLMin: z.number().positive() }),
  gradientFactors: z.object({ low: z.number().min(0).max(100), high: z.number().min(0).max(100) }).optional(),
  schedule: z.array(Row).min(1),
  notes: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const body = Req.parse(await req.json());

    const errors: string[] = [];
    const warnings: string[] = [];
    const info: string[] = [];

    const gasesCarried = body.gasesCarried.map(normalizeGas);
    const carriedSet = new Set(gasesCarried);

    const schedule = body.schedule
      .map(r => ({ ...r, gas: normalizeGas(r.gas) }))
      .sort((a, b) => (b.depthM - a.depthM) || (a.trtMin - b.trtMin));

    for (let i = 1; i < schedule.length; i++) {
      if (schedule[i].trtMin <= schedule[i - 1].trtMin) {
        errors.push(`TRT must be strictly increasing (row ${i + 1}).`);
        break;
      }
    }

    schedule.forEach((r, idx) => {
      if (!carriedSet.has(r.gas)) errors.push(`Row ${idx + 1}: gas "${r.gas}" not in gasesCarried.`);
    });

    const modByGasM: Record<string, number> = {};
    for (const g of gasesCarried) {
      const fo2 = parseFO2(g);
      modByGasM[g] = modForFO2(fo2, body.ppo2.deco);
    }

    let otuTotal = 0;
    let cnsTotal = 0;
    const ppo2ByStop: Array<{ depthM: number; gas: string; ppo2: number }> = [];

    for (let i = 0; i < schedule.length; i++) {
      const r = schedule[i];
      const fo2 = parseFO2(r.gas);
      const ppo2 = ppo2AtDepth(fo2, r.depthM);

      ppo2ByStop.push({ depthM: r.depthM, gas: r.gas, ppo2 });

      if (ppo2 > body.ppo2.deco + 1e-9) {
        errors.push(`Row ${i + 1}: PPO2 ${ppo2.toFixed(2)} exceeds deco limit ${body.ppo2.deco}.`);
      }

      const mod = modForFO2(fo2, body.ppo2.deco);
      if (r.depthM > mod + 1e-9) {
        errors.push(`Row ${i + 1}: depth ${r.depthM}m deeper than MOD ${mod.toFixed(1)}m for gas ${r.gas} at PPO2 ${body.ppo2.deco}.`);
      }

      otuTotal += otuForSegment(ppo2, r.stopMin);
      cnsTotal += cnsPercentForSegment(ppo2, r.stopMin);
    }

    const first = schedule[0];
    const workingTimeMin = first.trtMin - first.stopMin;
    if (workingTimeMin <= 0) warnings.push(`Pre-first-stop working time computed as ${workingTimeMin} min (check TRT/Stop values).`);

    const gasUsedLitresByGas: Record<string, number> = {};

    const workingGas = first.gas;
    const workingLitres = litresUsed(body.sac.workingLMin, body.maxDepthM, Math.max(0, workingTimeMin));
    gasUsedLitresByGas[workingGas] = (gasUsedLitresByGas[workingGas] ?? 0) + workingLitres;
    info.push(`Working gas assumes conservative: ${workingTimeMin} min at max depth (${body.maxDepthM}m).`);

    for (const r of schedule) {
      const litres = litresUsed(body.sac.decoLMin, r.depthM, r.stopMin);
      gasUsedLitresByGas[r.gas] = (gasUsedLitresByGas[r.gas] ?? 0) + litres;
    }

    const totalRuntimeMin = schedule[schedule.length - 1].trtMin;
    const banner = errors.length ? "ERRORS PRESENT" : warnings.length ? "WARNINGS PRESENT" : undefined;

    const labelText = buildLabelText({
      maxDepthM: body.maxDepthM,
      totalRuntimeMin,
      gasesCarried,
      modByGasM,
      schedule,
      gradientFactors: body.gradientFactors,
      otuTotal,
      cnsPercentTotal: cnsTotal,
      gasUsedLitresByGas,
      notes: body.notes,
      banner,
    });

    const resp: DiveLabelResponse = {
      checks: { errors, warnings, info },
      computed: {
        totalRuntimeMin,
        otuTotal,
        cnsPercentTotal: cnsTotal,
        gasUsedLitresByGas,
        modByGasM,
        ppo2ByStop,
      },
      labelText,
    };

    return NextResponse.json(resp);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Bad request" }, { status: 400 });
  }
}
