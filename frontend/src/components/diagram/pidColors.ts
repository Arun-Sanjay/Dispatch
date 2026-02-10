const PID_PALETTE = [
  "#38bdf8",
  "#f59e0b",
  "#22c55e",
  "#a78bfa",
  "#f472b6",
  "#2dd4bf",
  "#fb7185",
  "#60a5fa",
  "#f97316",
  "#34d399",
];

function hashPid(pid: string): number {
  let hash = 0;
  for (let i = 0; i < pid.length; i += 1) {
    hash = (hash * 31 + pid.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function getPidColor(pid: string): string {
  if (!pid || pid === "IDLE") return "#52525b";
  return PID_PALETTE[hashPid(pid) % PID_PALETTE.length] ?? PID_PALETTE[0];
}

export function getPidIndex(pid: string, modulo: number): number {
  if (!pid || pid === "IDLE" || modulo <= 0) return 0;
  return hashPid(pid) % modulo;
}
