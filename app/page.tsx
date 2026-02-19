"use client";

import React, { useMemo, useState } from "react";

type Row = { depthM: number; stopMin: number; trtMin: number; gas: string };

type ApiResponse = {
  checks: { errors: string[]; warnings: string[]; info: string[] };
  computed: {
    totalRuntimeMin: number;
    otuTotal: number;
    cnsPercentTotal: number;
    gasUsedLitresByGas: Record<string, number>;
    modByGasM: Record<string, number>;
    ppo2ByStop: Array<{ depthM: number; gas: string; ppo2: number }>;
  };
  labelText: string;
};

export default function Home() {
  // Inputs
  const [maxDepthM, setMaxDepthM] = useState<number>(39);
  const [gasesCarriedText, setGasesCarriedText] = useState<string>("21,100");
  const [ppo2Working, setPpo2Working] = useState<number>(1.4);
  const [ppo2Deco, setPpo2Deco] = useState<number>(1.6);
  const [sacWorking, setSacWorking] = useState<number>(18);
  const [sacDeco, setSacDeco] = useState<number>(14);
  const [gfLow, setGfLow] = useState<number>(30);
  const [gfHigh, setGfHigh] = useState<number>(85);
  const [notes, setNotes] = useState<string>("Demo schedule");

  // Schedule (seeded with your example)
  const [rows, setRows] = useState<Row[]>([
    { depthM: 29, stopMin: 1, trtMin: 26, gas: "21" },
    { depthM: 19, stopMin: 1, trtMin: 27, gas: "21" },
    { depthM: 15, stopMin: 1, trtMin: 28, gas: "21" },
    { depthM: 12, stopMin: 1, trtMin: 29, gas: "21" },
    { depthM: 9, stopMin: 4, trtMin: 33, gas: "21" },
    { depthM: 6, stopMin: 9, trtMin: 42, gas: "100" },
  ]);

  const gasesCarried = useMemo(
    () =>
      gasesCarriedText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    [gasesCarriedText]
  );

  // Result state
  const [result, setResult] = useState<ApiResponse | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [errorText, setErrorText] = useState<string>("");

  const addRow = () => {
    const last = rows[rows.length - 1];
    const nextTrt = last ? last.trtMin + 1 : 1;
    setRows([
      ...rows,
      { depthM: Math.max(0, (last?.depthM ?? 6) - 3), stopMin: 1, trtMin: nextTrt, gas: last?.gas ?? "21" },
    ]);
  };

  const deleteRow = (idx: number) => setRows(rows.filter((_, i) => i !== idx));

  const updateRow = (idx: number, patch: Partial<Row>) => {
    setRows(rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const run = async () => {
    setIsRunning(true);
    setErrorText("");
    setResult(null);

    const payload = {
      maxDepthM,
      gasesCarried,
      ppo2: { working: ppo2Working, deco: ppo2Deco },
      sac: { workingLMin: sacWorking, decoLMin: sacDeco },
      gradientFactors: { low: gfLow, high: gfHigh },
      schedule: rows,
      notes,
    };

    try {
      const res = await fetch("/api/dive/label", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`HTTP ${res.status}: ${txt}`);
      }

      const data = (await res.json()) as ApiResponse;
      setResult(data);
    } catch (e: any) {
      setErrorText(e?.message ?? "Something went wrong");
    } finally {
      setIsRunning(false);
    }
  };

  const copyLabel = async () => {
    if (!result?.labelText) return;
    await navigator.clipboard.writeText(result.labelText);
  };

  const fmt = (n: number) => Number.isFinite(n) ? n.toFixed(2) : String(n);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold">Dive Plan Label Maker + Sanity Checker</h1>
          <p className="text-neutral-300 mt-2">
            Formats an existing stop schedule into a printable label and checks PPO₂/MOD, OTU, CNS, and gas usage.{" "}
            <span className="text-neutral-400">Not a dive plan generator.</span>
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Inputs */}
          <section className="rounded-2xl bg-neutral-900/60 border border-neutral-800 p-4">
            <h2 className="font-semibold mb-3">Inputs</h2>

            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm">
                <div className="text-neutral-300 mb-1">Max depth (m)</div>
                <input
                  className="w-full rounded-lg bg-neutral-950 border border-neutral-800 px-3 py-2"
                  type="number"
                  value={maxDepthM}
                  onChange={(e) => setMaxDepthM(Number(e.target.value))}
                  
                />
              </label>

              <label className="text-sm">
                <div className="text-neutral-300 mb-1">Gases carried (comma)</div>
                <input
                  className="w-full rounded-lg bg-neutral-950 border border-neutral-800 px-3 py-2"
                  value={gasesCarriedText}
                  onChange={(e) => setGasesCarriedText(e.target.value)}
                  placeholder="21, 50, 100, Tx18/45"
                />
              </label>

              <label className="text-sm">
                <div className="text-neutral-300 mb-1">PPO₂ working</div>
                <input
                  className="w-full rounded-lg bg-neutral-950 border border-neutral-800 px-3 py-2"
                  type="number"
                  step="0.01"
                  value={ppo2Working}
                  onChange={(e) => setPpo2Working(Number(e.target.value))}
                />
              </label>

              <label className="text-sm">
                <div className="text-neutral-300 mb-1">PPO₂ deco</div>
                <input
                  className="w-full rounded-lg bg-neutral-950 border border-neutral-800 px-3 py-2"
                  type="number"
                  step="0.01"
                  value={ppo2Deco}
                  onChange={(e) => setPpo2Deco(Number(e.target.value))}
                />
              </label>

              <label className="text-sm">
                <div className="text-neutral-300 mb-1">SAC working (L/min)</div>
                <input
                  className="w-full rounded-lg bg-neutral-950 border border-neutral-800 px-3 py-2"
                  type="number"
                  step="0.1"
                  value={sacWorking}
                  onChange={(e) => setSacWorking(Number(e.target.value))}
                />
              </label>

              <label className="text-sm">
                <div className="text-neutral-300 mb-1">SAC deco (L/min)</div>
                <input
                  className="w-full rounded-lg bg-neutral-950 border border-neutral-800 px-3 py-2"
                  type="number"
                  step="0.1"
                  value={sacDeco}
                  onChange={(e) => setSacDeco(Number(e.target.value))}
                />
              </label>

              <label className="text-sm">
                <div className="text-neutral-300 mb-1">GF low</div>
                <input
                  className="w-full rounded-lg bg-neutral-950 border border-neutral-800 px-3 py-2"
                  type="number"
                  value={gfLow}
                  onChange={(e) => setGfLow(Number(e.target.value))}
                />
              </label>

              <label className="text-sm">
                <div className="text-neutral-300 mb-1">GF high</div>
                <input
                  className="w-full rounded-lg bg-neutral-950 border border-neutral-800 px-3 py-2"
                  type="number"
                  value={gfHigh}
                  onChange={(e) => setGfHigh(Number(e.target.value))}
                />
              </label>

              <label className="text-sm col-span-2">
                <div className="text-neutral-300 mb-1">Notes</div>
                <input
                  className="w-full rounded-lg bg-neutral-950 border border-neutral-800 px-3 py-2"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </label>
            </div>

<label className="text-sm mt-4 block">
  <div className="text-neutral-300 mb-1">Import Subsurface (.ssrf)</div>
  <input
    type="file"
    accept=".ssrf,.xml"
    onChange={async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/dive/import-subsurface", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Import failed");
        return;
      }

      if (data.maxDepthM) setMaxDepthM(data.maxDepthM);
      if (data.gasesCarried?.length) setGasesCarriedText(data.gasesCarried.join(","));
      if (data.schedule) setRows(data.schedule);
    }}
    className="w-full rounded-lg bg-neutral-950 border border-neutral-800 px-3 py-2"
  />
</label>

            <button
              onClick={run}
              disabled={isRunning}
              className="mt-4 w-full rounded-xl bg-neutral-100 text-neutral-900 font-semibold px-4 py-2 disabled:opacity-50"
            >
              {isRunning ? "Running…" : "Generate label + checks"}
            </button>

            {errorText ? (
              <div className="mt-3 rounded-xl border border-red-900/60 bg-red-950/40 p-3 text-sm text-red-200">
                {errorText}
              </div>
            ) : null}
          </section>

          {/* Schedule table */}
          <section className="rounded-2xl bg-neutral-900/60 border border-neutral-800 p-4 lg:col-span-1">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">Stop schedule</h2>
              <button
                onClick={addRow}
                className="rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-1 text-sm"
              >
                + Add row
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-neutral-300">
                  <tr className="border-b border-neutral-800">
                    <th className="py-2 text-left">Depth</th>
                    <th className="py-2 text-left">Stop</th>
                    <th className="py-2 text-left">TRT</th>
                    <th className="py-2 text-left">Gas</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, idx) => (
                    <tr key={idx} className="border-b border-neutral-900">
                      <td className="py-2 pr-2">
                        <input
                          className="w-20 rounded-lg bg-neutral-950 border border-neutral-800 px-2 py-1"
                          type="number"
                          value={r.depthM}
                          onChange={(e) => updateRow(idx, { depthM: Number(e.target.value) })}
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          className="w-20 rounded-lg bg-neutral-950 border border-neutral-800 px-2 py-1"
                          type="number"
                          value={r.stopMin}
                          onChange={(e) => updateRow(idx, { stopMin: Number(e.target.value) })}
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          className="w-20 rounded-lg bg-neutral-950 border border-neutral-800 px-2 py-1"
                          type="number"
                          value={r.trtMin}
                          onChange={(e) => updateRow(idx, { trtMin: Number(e.target.value) })}
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          className="w-24 rounded-lg bg-neutral-950 border border-neutral-800 px-2 py-1"
                          value={r.gas}
                          onChange={(e) => updateRow(idx, { gas: e.target.value })}
                        />
                      </td>
                      <td className="py-2 text-right">
                        <button
                          onClick={() => deleteRow(idx)}
                          className="rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs text-neutral-300"
                        >
                          Del
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-3 text-xs text-neutral-400">
              Tip: Keep TRT strictly increasing. “Gas” supports 21, 32, 50, 100/O2, 21/35, Tx18/45.
            </p>
          </section>

          {/* Output */}
          <section className="rounded-2xl bg-neutral-900/60 border border-neutral-800 p-4 lg:col-span-1">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">Output</h2>
              <button
                onClick={copyLabel}
                disabled={!result?.labelText}
                className="rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-1 text-sm disabled:opacity-50"
              >
                Copy label
              </button>
            </div>

            {!result ? (
              <div className="text-sm text-neutral-400">
                Run the checker to see label text, exposure, and gas usage.
              </div>
            ) : (
              <div className="space-y-4">
                {/* Checks */}
                <div className="grid grid-cols-1 gap-2 text-sm">
                  {result.checks.errors.length ? (
                    <div className="rounded-xl border border-red-900/60 bg-red-950/40 p-3">
                      <div className="font-semibold text-red-200 mb-1">Errors</div>
                      <ul className="list-disc ml-5 text-red-100">
                        {result.checks.errors.map((e, i) => <li key={i}>{e}</li>)}
                      </ul>
                    </div>
                  ) : null}

                  {result.checks.warnings.length ? (
                    <div className="rounded-xl border border-amber-900/60 bg-amber-950/30 p-3">
                      <div className="font-semibold text-amber-200 mb-1">Warnings</div>
                      <ul className="list-disc ml-5 text-amber-100">
                        {result.checks.warnings.map((w, i) => <li key={i}>{w}</li>)}
                      </ul>
                    </div>
                  ) : null}

                  {result.checks.info.length ? (
                    <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-3">
                      <div className="font-semibold text-neutral-200 mb-1">Info</div>
                      <ul className="list-disc ml-5 text-neutral-300">
                        {result.checks.info.map((t, i) => <li key={i}>{t}</li>)}
                      </ul>
                    </div>
                  ) : null}
                </div>

                {/* Summary */}
                <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-3 text-sm">
                  <div className="font-semibold text-neutral-200 mb-2">Summary</div>
                  <div className="grid grid-cols-2 gap-2 text-neutral-300">
                    <div>Total runtime</div><div className="text-right">{result.computed.totalRuntimeMin} min</div>
                    <div>OTU</div><div className="text-right">{fmt(result.computed.otuTotal)}</div>
                    <div>CNS</div><div className="text-right">{fmt(result.computed.cnsPercentTotal)}%</div>
                  </div>
                </div>

                {/* Gas usage */}
                <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-3 text-sm">
                  <div className="font-semibold text-neutral-200 mb-2">Gas used (litres)</div>
                  <div className="space-y-1 text-neutral-300">
                    {Object.entries(result.computed.gasUsedLitresByGas).map(([g, l]) => (
                      <div key={g} className="flex justify-between">
                        <span>{g}</span><span>{Math.round(l)} L</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Label */}
                <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-3">
                  <div className="font-semibold text-neutral-200 mb-2 text-sm">Label text</div>
                  <pre className="text-xs text-neutral-200 whitespace-pre-wrap font-mono leading-5">
                    {result.labelText}
                  </pre>
                </div>
              </div>
            )}
          </section>
        </div>

        <footer className="mt-8 text-xs text-neutral-500">
          Safety note: This tool formats and validates an existing schedule. It does not generate decompression stops.
        </footer>
      </div>
    </div>
  );
}
