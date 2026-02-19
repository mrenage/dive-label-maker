import { NextResponse } from "next/server";
import { XMLParser } from "fast-xml-parser";

function asArray<T>(x: T | T[] | undefined | null): T[] {
  if (!x) return [];
  return Array.isArray(x) ? x : [x];
}

function isObject(v: any): v is Record<string, any> {
  return v !== null && typeof v === "object";
}

function findDives(node: any, out: any[] = []): any[] {
  if (!isObject(node)) return out;

  if ((node as any).dive) out.push(...asArray((node as any).dive));

  for (const key of Object.keys(node)) {
    const child = (node as any)[key];
    if (isObject(child)) findDives(child, out);
    else if (Array.isArray(child)) for (const item of child) if (isObject(item)) findDives(item, out);
  }

  return out;
}

// "54:13 min" -> seconds, "3:03 min" -> seconds
function parseTimeToSeconds(raw: any): number {
  if (raw == null) return 0;
  const s = String(raw).trim();

  // Try "MM:SS"
  const mmss = s.match(/(\d+):(\d+)\s*min/i);
  if (mmss) {
    const mm = Number(mmss[1]);
    const ss = Number(mmss[2]);
    if (Number.isFinite(mm) && Number.isFinite(ss)) return mm * 60 + ss;
  }

  // Try "X min"
  const mins = s.match(/(\d+(\.\d+)?)\s*min/i);
  if (mins) return Math.round(Number(mins[1]) * 60);

  // Try plain number seconds
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

// "55.0 m" -> meters
function parseDepthM(raw: any): number {
  if (raw == null) return 0;
  const s = String(raw).trim();

  const m = s.match(/(-?\d+(\.\d+)?)\s*m/i);
  if (m) return Number(m[1]);

  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function fo2FromGasString(gas: string): number {
  const s = gas.trim().toUpperCase();
  // "50", "21", "100"
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s) / 100;

  // "21/35" -> O2 is first
  const slash = s.match(/^(\d+(\.\d+)?)\/(\d+(\.\d+)?)$/);
  if (slash) return Number(slash[1]) / 100;

  // "TX18/45"
  const tx = s.match(/^TX(\d+(\.\d+)?)\/(\d+(\.\d+)?)$/);
  if (tx) return Number(tx[1]) / 100;

  return NaN;
}

function ppo2AtDepth(fo2: number, depthM: number): number {
  const ata = depthM / 10 + 1;
  return fo2 * ata;
}


function uniqSorted(arr: string[]) {
  const uniq = Array.from(new Set(arr.map(s => s.trim()).filter(Boolean)));

  // Sort: put trimix first, then numeric gases ascending
  const isTx = (s: string) => /^TX\d+(\.\d+)?\/\d+(\.\d+)?$/i.test(s);
  const asNum = (s: string) => {
    const n = Number(s);
    return Number.isFinite(n) ? n : 1e9;
  };

  return uniq.sort((a, b) => {
    const aTx = isTx(a), bTx = isTx(b);
    if (aTx && !bTx) return -1;
    if (!aTx && bTx) return 1;
    return asNum(a) - asNum(b);
  });
}

type Sample = { tSec: number; depthM: number; gas: string };

// Build gas timeline from Subsurface events like:
// <event time='23:42 min' name='gaschange' o2='50.0%' ... />
function buildGasTimeline(events: any[], defaultGas: string) {
  const changes = events
    .filter((e) => String(e?.name ?? "").toLowerCase() === "gaschange")
    .map((e) => {
      const tSec = parseTimeToSeconds(e.time);
      const o2Raw = e.o2 ?? e.O2 ?? e.oxygen;
      const o2 = o2Raw ? Number(String(o2Raw).replace("%", "")) : NaN;
      const gas = Number.isFinite(o2) ? String(Math.round(o2)) : "unknown";
      return { tSec, gas };
    })
    .filter((x) => x.tSec >= 0 && x.gas !== "unknown")
    .sort((a, b) => a.tSec - b.tSec);

  const timeline = [{ tSec: 0, gas: defaultGas }, ...changes];

  const gasAt = (tSec: number) => {
    let gas = defaultGas;
    for (const c of changes) {
      if (tSec >= c.tSec) gas = c.gas;
      else break;
    }
    return gas;
  };

  return { timeline, gasAt };
}

function gasAtTimeBreathable(tSec: number, depthM: number, timeline: Array<{ tSec: number; gas: string }>, ppo2Limit: number) {
  // Find latest index <= tSec
  let idx = 0;
  for (let i = 0; i < timeline.length; i++) {
    if (timeline[i].tSec <= tSec) idx = i;
    else break;
  }

  // Walk backwards until breathable (or hit start)
  for (let i = idx; i >= 0; i--) {
    const gas = timeline[i].gas;
    const fo2 = fo2FromGasString(gas);
    if (!Number.isFinite(fo2)) continue;

    const ppo2 = ppo2AtDepth(fo2, depthM);
    if (ppo2 <= ppo2Limit + 1e-9) return gas;
  }

  // Fallback
  return timeline[0]?.gas ?? "unknown";
}


function deriveSegments(samples: Sample[], opts?: { roundDepthM?: number; minSegSec?: number }) {
  const roundDepthM = opts?.roundDepthM ?? 1;
  const minSegSec = opts?.minSegSec ?? 30;

  const s = [...samples].sort((a, b) => a.tSec - b.tSec);
  if (s.length < 2) return [];

  // “Segments” = consecutive samples at the same rounded depth
  const segments: Array<{ depthM: number; startSec: number; endSec: number; gas: string }> = [];

  let curDepth = Math.round(s[0].depthM / roundDepthM) * roundDepthM;
  let startSec = s[0].tSec;
  let lastSec = s[0].tSec;
  let curGas = s[0].gas;

  const flush = () => {
    const dur = lastSec - startSec;
    if (dur >= minSegSec) {
      segments.push({ depthM: curDepth, startSec, endSec: lastSec, gas: curGas });
    }
  };

  for (let i = 1; i < s.length; i++) {
    const d = Math.round(s[i].depthM / roundDepthM) * roundDepthM;
    const same = d === curDepth;

    if (!same) {
      flush();
      curDepth = d;
      startSec = s[i - 1].tSec; // carry continuity
    }

    lastSec = s[i].tSec;
    curGas = s[i].gas || curGas;
  }

  flush();
  return segments;
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });

    const text = await file.text();

    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "",
      allowBooleanAttributes: true,
      parseAttributeValue: false,
      parseTagValue: false,
      trimValues: true,
    });

    const parsed = parser.parse(text);
    const dives = findDives(parsed);
    if (!dives.length) return NextResponse.json({ error: "Could not find any dives in file." }, { status: 400 });

    const dive = dives[0];

    // In your export, samples live under <dive><divecomputer>...</divecomputer>
    const divecomputer = dive?.divecomputer;
    const dc = Array.isArray(divecomputer) ? divecomputer[0] : divecomputer;

    const samplesRaw = dc?.sample ?? dive?.sample ?? dive?.samples?.sample;
    const samplesArr = asArray(samplesRaw);
    if (!samplesArr.length) {
      return NextResponse.json({ error: "Found dive but no <sample> data." }, { status: 400 });
    }

    const eventsArr = asArray(dc?.event ?? dive?.event ?? []);

    // Default gas: use first cylinder O2% if present, else assume 21
    const cylinders = asArray(dive?.cylinder);
    let defaultGas = "21";
    if (cylinders.length) {
      const o2raw = cylinders[0]?.o2;
      if (o2raw) {
        const o2 = Number(String(o2raw).replace("%", ""));
        if (Number.isFinite(o2)) defaultGas = String(Math.round(o2));
      }
    }

// Build gases carried from cylinders + gaschange events
const gasesFromCyl = cylinders
  .map((c: any) => {
    const o2raw = c?.o2;
    if (!o2raw) return null;

    const o2 = Number(String(o2raw).replace("%", ""));
    if (!Number.isFinite(o2)) return null;

    const heraw = c?.he ?? c?.He ?? c?.helium;
    const he = heraw != null ? Number(String(heraw).replace("%", "")) : NaN;

    // If helium exists and > 0, return trimix string
    if (Number.isFinite(he) && he > 0) {
      return `Tx${Math.round(o2)}/${Math.round(he)}`;
    }

    // Otherwise just O2 percent (Nitrox / O2)
    return String(Math.round(o2));
  })
  .filter(Boolean) as string[];


const gasesFromEvents = eventsArr
  .filter((e: any) => String(e?.name ?? "").toLowerCase() === "gaschange")
  .map((e: any) => {
    const o2raw = e.o2 ?? e.O2 ?? e.oxygen;
    if (!o2raw) return null;
    const o2 = Number(String(o2raw).replace("%", ""));
    return Number.isFinite(o2) ? String(Math.round(o2)) : null;
  })
  .filter(Boolean) as string[];

const gasesCarried = uniqSorted([defaultGas, ...gasesFromCyl, ...gasesFromEvents]);

// If we have a trimix whose O2% matches a numeric gas (e.g., Tx18/45 and "18"),
// prefer the trimix string and drop the numeric duplicate.
const txO2Set = new Set(
  gasesCarried
    .filter((g) => /^Tx\d+\/\d+$/i.test(g))
    .map((g) => {
      const m = g.match(/^Tx(\d+)\//i);
      return m ? m[1] : null;
    })
    .filter(Boolean) as string[]
);

const gasesCarriedClean = gasesCarried.filter((g) => {
  const n = Number(g);
  if (!Number.isFinite(n)) return true; // keep non-numeric (Tx...)
  return !txO2Set.has(String(Math.round(n))); // drop numeric if TxO2 exists
});

// Map numeric O2 gases (e.g. "18") to a matching trimix gas (e.g. "Tx18/45") if present
const txByO2 = new Map<string, string>();
for (const g of gasesCarriedClean) {
  const m = g.match(/^Tx(\d+)\//i);
  if (m) txByO2.set(String(Number(m[1])), g);
} 


const { timeline, gasAt: gasAtTime } = buildGasTimeline(eventsArr, defaultGas);


    const samples: Sample[] = samplesArr
      .map((x: any) => {
        const tSec = parseTimeToSeconds(x.time);
        const depthM = parseDepthM(x.depth);
        return { tSec, depthM, gas: gasAtTime(tSec) };
      })
      .filter((s) => Number.isFinite(s.tSec) && Number.isFinite(s.depthM))
      .sort((a, b) => a.tSec - b.tSec);

    // Create segments from samples
    const segments = deriveSegments(samples, { roundDepthM: 1, minSegSec: 30 });

    if (!segments.length) {
      return NextResponse.json(
        { error: "Could not derive any segments from samples (file may be too sparse)." },
        { status: 400 }
      );
    }

    // Convert to your schedule rows
    const schedule = segments.map((seg) => {
      let gas = gasAtTimeBreathable(
        Math.round((seg.startSec + seg.endSec) / 2),
        seg.depthM,
        timeline,
        1.6
      );

      const n = Number(gas);
      if (Number.isFinite(n)) {
        const mapped = txByO2.get(String(Math.round(n)));
        if (mapped) gas = mapped;
      }

      return {
        depthM: Math.round(seg.depthM),
        stopMin: Math.max(1, Math.round((seg.endSec - seg.startSec) / 60)),
        trtMin: Math.max(1, Math.round(seg.endSec / 60)),
        gas,
      };
    });

    const maxDepthM =
      parseDepthM(dive?.depth?.max ?? dive?.maxdepth ?? dive?.maxDepth ?? 0) ||
      Math.max(...samples.map((s) => s.depthM), 0);

    return NextResponse.json({
      maxDepthM: Math.round(maxDepthM),
      gasesCarried: gasesCarriedClean,
      schedule,
      meta: {
        divesFound: dives.length,
        samplesFound: samples.length,
        segmentsDerived: segments.length,
        note:
          "Imported from Subsurface samples (not a planner stop table). With sparse samples, segments may be coarse. Gas set via gaschange events + PPO₂ sanity.",
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Import failed" },
      { status: 400 }
    );
  }
}
