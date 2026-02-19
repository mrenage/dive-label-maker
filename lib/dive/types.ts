export type DiveLabelRequest = {
  maxDepthM: number;
  gasesCarried: string[];
  ppo2: { working: number; deco: number };
  sac: { workingLMin: number; decoLMin: number };
  gradientFactors?: { low: number; high: number };
  schedule: Array<{ depthM: number; stopMin: number; trtMin: number; gas: string }>;
  notes?: string;
};

export type DiveLabelResponse = {
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
