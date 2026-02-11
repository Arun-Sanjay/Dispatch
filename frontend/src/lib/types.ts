export type Algorithm = "FCFS" | "SJF" | "PRIORITY" | "RR" | "MLQ";
export type AlgorithmMode = "FCFS" | "SJF" | "PRIORITY_NP" | "PRIORITY_P" | "RR" | "MLQ";
export type OptimizeFor = "throughput" | "responsiveness" | "fairness";
export type QueueType = "SYS" | "USER";
export type MemoryMode = "CPU_ONLY" | "FULL";
export type MemoryAlgorithm = "FIFO" | "LRU" | "LFU" | "OPT" | "CLOCK";
export type BurstType = "CPU" | "IO";
export type ProcessRuntimeState = "NEW" | "READY" | "RUNNING" | "WAITING_IO" | "WAITING_MEM" | "DONE";

export interface BurstSegment {
  type: BurstType;
  len: number;
}

export interface ProcessInput {
  pid: string;
  arrival_time: number;
  priority?: number;
  queue?: QueueType;
  bursts?: number[];
  burst_segments?: BurstSegment[];
  burst_time?: number;
  working_set_size?: number;
  working_set_pages?: number[];
  refs_per_cpu_tick?: number;
  fault_penalty_ticks?: number;
  addr_pattern?: "SEQ" | "LOOP" | "RAND" | "CUSTOM";
  custom_addrs?: number[];
  vm_size_bytes?: number;
  address_base?: number;
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

export interface MemoryStep {
  t: number;
  ref?: number;
  va?: number;
  vpn?: number;
  pfn?: number;
  offset?: number;
  frames?: Array<number | null>;
  hit: boolean;
  fault?: boolean;
  evicted?: number | { pid?: string; vpn?: number; pfn?: number };
  pid?: string;
}

export interface MemoryFrame {
  pfn: number;
  pid: string | null;
  vpn: number | null;
  loaded_at?: number;
  last_used?: number;
  freq?: number;
  ref_bit?: number | boolean;
}

export interface PageTableEntry {
  vpn: number;
  present: boolean;
  pfn: number | null;
  last_used?: number;
  freq?: number;
  dirty?: boolean;
}

export interface MemoryState {
  enabled?: MemoryMode;
  mode: MemoryMode;
  algo: MemoryAlgorithm;
  page_size?: number;
  num_frames?: number;
  frames_count?: number;
  frames: MemoryFrame[];
  fault_penalty: number;
  faults: number;
  hits: number;
  hit_ratio: number;
  frame_state?: Array<number | null>;
  page_tables?: Record<string, PageTableEntry[]>;
  recent_steps: MemoryStep[];
  mem_gantt: string[];
  last_translation_log?: string[];
}

export interface ProcessRuntimeRow {
  pid: string;
  state: ProcessRuntimeState | string;
  arrival_time: number;
  priority?: number;
  queue?: QueueType;
  burst_index?: number;
  remaining_in_current_burst?: number;
  bursts?: number[];
  working_set_pages?: number[];
  refs_per_cpu_tick?: number;
  addr_pattern?: "SEQ" | "LOOP" | "RAND" | "CUSTOM" | string;
  vm_size_bytes?: number;
  address_base?: number;
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
  mem_gantt: string[];
  completed: string[];
  metrics: Metrics;
  per_process: PerProcessRow[];
  processes: ProcessRuntimeRow[];
  event_log: string[];
  memory: MemoryState;
}
