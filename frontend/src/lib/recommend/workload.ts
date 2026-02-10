export type WorkloadProcess = {
  pid?: string;
  arrival_time: number;
  bursts?: number[];
  cpu_bursts?: number[];
  io_bursts?: number[];
  burst_time?: number;
};

export type WorkloadProfile = {
  total_cpu: number;
  total_io: number;
  io_ratio: number;
  avg_cpu_burst: number;
  std_cpu_burst: number;
  burst_variance: number;
  n_procs: number;
  arrival_spread: number;
  burst_count_total: number;
};

function normalizeBursts(process: WorkloadProcess): number[] {
  if (process.bursts && process.bursts.length) return process.bursts;

  if ((process.cpu_bursts?.length ?? 0) > 0) {
    const combined: number[] = [];
    const cpu = process.cpu_bursts ?? [];
    const io = process.io_bursts ?? [];
    for (let i = 0; i < cpu.length; i += 1) {
      combined.push(cpu[i]);
      if (i < io.length) combined.push(io[i]);
    }
    return combined;
  }

  if (typeof process.burst_time === "number" && process.burst_time > 0) {
    return [process.burst_time];
  }

  return [1];
}

function std(values: number[]): number {
  if (!values.length) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export function extractWorkloadProfile(processes: WorkloadProcess[]): WorkloadProfile {
  const arrivals = processes.map((process) => Number(process.arrival_time) || 0);
  const cpuBursts: number[] = [];
  let totalIo = 0;

  for (const process of processes) {
    const bursts = normalizeBursts(process);
    for (let i = 0; i < bursts.length; i += 1) {
      const value = Math.max(1, Math.round(Number(bursts[i]) || 0));
      if (i % 2 === 0) cpuBursts.push(value);
      else totalIo += value;
    }
  }

  const totalCpu = cpuBursts.reduce((sum, value) => sum + value, 0);
  const avgCpu = cpuBursts.length > 0 ? totalCpu / cpuBursts.length : 0;
  const stdCpu = std(cpuBursts);
  const arrivalSpread = arrivals.length > 0 ? Math.max(...arrivals) - Math.min(...arrivals) : 0;

  return {
    total_cpu: totalCpu,
    total_io: totalIo,
    io_ratio: totalIo / Math.max(totalCpu, 1),
    avg_cpu_burst: avgCpu,
    std_cpu_burst: stdCpu,
    burst_variance: stdCpu / Math.max(avgCpu, 1),
    n_procs: processes.length,
    arrival_spread: arrivalSpread,
    burst_count_total: cpuBursts.length,
  };
}
