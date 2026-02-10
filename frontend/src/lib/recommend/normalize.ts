export type MetricDirection = "low" | "high";

const EPS = 1e-6;

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

export function percentile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (q / 100) * (sorted.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  const weight = position - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

type Scale = {
  median: number;
  iqr: number;
  min: number;
  max: number;
  useMinMax: boolean;
};

function buildScale(values: number[]): Scale {
  const finite = values.filter((value) => Number.isFinite(value));
  if (finite.length === 0) {
    return {
      median: 0,
      iqr: 0,
      min: 0,
      max: 0,
      useMinMax: true,
    };
  }

  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const median = percentile(finite, 50);
  const q1 = percentile(finite, 25);
  const q3 = percentile(finite, 75);
  const iqr = q3 - q1;

  return {
    median,
    iqr,
    min,
    max,
    useMinMax: Math.abs(iqr) < EPS,
  };
}

export function robustNormalizeMetric(values: number[], direction: MetricDirection): number[] {
  const scale = buildScale(values);

  if (scale.useMinMax) {
    const range = scale.max - scale.min;
    return values.map((value) => {
      if (!Number.isFinite(value)) return 1;
      if (Math.abs(range) < EPS) return 0.5;
      const minMax = (value - scale.min) / range;
      return direction === "low" ? minMax : 1 - minMax;
    });
  }

  return values.map((value) => {
    if (!Number.isFinite(value)) return 1;
    // Robust scaling:
    // robust_z = (x - median) / IQR.
    // Then sigmoid maps to 0..1 and saturates outliers, limiting skew.
    const robustZ = (value - scale.median) / Math.max(scale.iqr, EPS);
    if (direction === "low") {
      return sigmoid(robustZ);
    }
    return sigmoid(-robustZ);
  });
}
