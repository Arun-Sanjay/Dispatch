export type Algorithm = "FCFS" | "SJF" | "PRIORITY" | "RR" | "MLQ";
export type AlgorithmMode = "FCFS" | "SJF" | "PRIORITY_NP" | "PRIORITY_P" | "RR" | "MLQ";
export type OptimizeFor = "throughput" | "responsiveness" | "fairness";
export type QueueType = "SYS" | "USER";

export interface ProcessInput {
  pid: string;
  arrival_time: number;
  priority?: number;
  queue?: QueueType;
  bursts?: number[];
  burst_time?: number;
}

export interface Metrics {
  avg_wt: number;
  avg_tat: number;
  avg_rt: number;
  cpu_util: number;
  makespan: number;
  throughput: number;
}

export interface PerProcessRow {
  pid: string;
  at: number;
  pr?: number;
  queue?: QueueType;
  st?: number | null;
  ct?: number | null;
  tat?: number | null;
  wt?: number | null;
  rt?: number | null;
}

export interface SimulatorState {
  time: number;
  algorithm: Algorithm;
  preemptive?: boolean;
  tick_ms: number;
  quantum: number;
  running: string;
  ready_queue: string[];
  sys_queue?: string[];
  user_queue?: string[];
  io_active: string;
  io_queue: string[];
  gantt: string[];
  io_gantt: string[];
  completed: string[];
  metrics: Metrics;
  per_process: PerProcessRow[];
  event_log: string[];
}
