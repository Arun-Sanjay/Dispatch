# Dispatch — See the Scheduler Think. Visualize Scheduling. Compare Algorithms.

Dispatch is an interactive **CPU Scheduling Visualizer** with a real-time simulation engine and a modern web UI.
It’s built to help you **understand how scheduling decisions actually play out over time**—not as a static Gantt chart, but as a live OS-style simulator with queue movement, execution timelines, I/O realism, performance metrics, algorithm comparison, and an optional **Full System Mode** that adds **virtual memory + paging**.

---

## ✨ What Dispatch Does

Dispatch simulates how an operating system schedules processes and shows the results live:

- **Run scheduling algorithms** (FCFS, SJF, Priority, RR, MLQ)
- **Watch CPU execution in real time** (Gantt timeline)
- Track **Ready Queue movement** (including MLQ SYS/USER queues)
- Model **CPU + I/O bursts** (process alternates CPU → I/O → CPU)
- View **I/O device timeline** and I/O blocking/unblocking
- Collect standard metrics:
  - Waiting Time (WT), Turnaround Time (TAT), Response Time (RT)
  - CPU Utilization, Makespan, Throughput
- **Compare algorithms** on the same workload using a built-in comparison view
- Optional **Full System Simulation Mode**:
  - Adds **global RAM frames**
  - Per-process **page tables**
  - Virtual address translation (VA → VPN → PFN)
  - Page faults, replacement algorithms (FIFO/LRU/LFU/Clock/OPT as available)
  - Memory timeline (HIT/FAULT), RAM viewer, page table viewer

---

## ✅ Why This Project Is Strong

Dispatch is valuable because it is:

### 1) A true simulator (not a static chart)
Most “scheduling visualizers” generate a final schedule and draw a chart.
Dispatch runs a **tick-by-tick simulation loop**, making every state transition visible:
- NEW → READY → RUNNING → WAITING_IO / WAITING_MEM → READY → DONE

### 2) Real-time, interactive, and configurable
- Change algorithm settings and speed
- Add processes live
- Inspect process state and scheduling decisions

### 3) Data-structure heavy (implemented for performance + clarity)
Dispatch uses real DS concepts in a practical way:
- Queues / Deques for ready queues and RR rotation
- Priority structures for SJF/Priority selection
- Run-length encoded segments to render timelines efficiently
- Fenwick Tree + Segment Tree for range analytics (busy/idle + streak queries)
- Paging DS: frame table, page table, LRU/LFU structures (in Full mode)

### 4) “Explainable simulation”
The UI is designed to answer instantly:
- Where is each process now?
- Why did it move?
- What happened this tick?

---

## 🧠 Scheduling Algorithms Supported

- **FCFS (First Come First Serve)** — non-preemptive, arrival order
- **SJF (Shortest Job First)** — selects smallest CPU burst (non-preemptive in most configs)
- **Priority Scheduling** — priority-based selection (can be preemptive depending config)
- **Round Robin (RR)** — time-sliced with quantum
- **MLQ (Multi-Level Queue)** — SYS vs USER queues (SYS dominates USER), optional slicing behavior

---

## 🧩 Process Model (CPU + I/O Bursts)

Each process contains a list of bursts:

`bursts = [CPU1, IO1, CPU2, IO2, ...]`

Example:
- `[5, 2, 1]` → CPU 5 ticks → I/O 2 ticks → CPU 1 tick → DONE
- `[3]` → CPU-only process

This adds realism: processes can block for I/O and rejoin the ready queue later.

---

## 🧠 Full System Mode (CPU + Memory + Paging)

In **Full System Mode**, a process does not just “use CPU” — it also performs **memory accesses** while running.

### How memory works here
- System has **global RAM** with fixed number of frames
- Each process has a **page table** (VPN → PFN, present bit, usage info)
- Each CPU tick for RUNNING process produces memory access(es):
  - If referenced page is present → **HIT**
  - If not present → **PAGE FAULT**
    - Page replacement runs (FIFO/LRU/LFU/Clock/OPT as available)
    - Page table + RAM update
    - Process goes to **WAITING_MEM** for `fault_penalty_ticks`

### Memory visualizations
- RAM viewer: frames showing (PID, VPN, metadata)
- Page table viewer: per-process mapping and present bits
- Translation log: `VA → VPN → PFN → HIT/FAULT (+ eviction info)`
- Memory timeline: HIT/FAULT events across time

---

## 🧱 Tech Stack

### Frontend
- **Next.js (App Router) + TypeScript**
- **Tailwind CSS**
- **shadcn/ui** components
- **Framer Motion** (animations)
- **Recharts** (metrics/compare charts)
- **WebSocket** client for real-time state updates

### Backend
- **FastAPI**
- **WebSocket** server for pushing sim state
- Scheduler engine extracted into clean modules (`engine/`)
- Optional memory subsystem for Full mode

---

## 📁 Repository Structure

Typical structure:

```
cpu-scheduling-visualizer-web/
  backend/
    app/
      api/           # REST + WebSocket routes
      engine/        # scheduler logic (Process, Scheduler, Metrics, Datasets, Compare)
      memory/        # paging + RAM + page tables (Full mode)
    main.py
    requirements.txt
  frontend/
    app/             # Next.js routes (Simulate, Compare, Learn, Memory)
    components/
    lib/
    package.json
  README.md
```

---

## 🚀 How To Run (Step-by-step)

### 0) Prerequisites
- **Python 3.10+**
- **Node.js 18+**
- macOS / Linux / Windows supported

---

## 1) Clone the repo
```bash
git clone https://github.com/Arun-Sanjay/Dispatch.git
cd Dispatch/dsa-task-scheduler/dsa-task-scheduler/cpu-scheduling-visualizer-web
```

> If your repo layout differs, just `cd` into the folder that contains `frontend/` and `backend/`.

---

## 2) Run the Backend (FastAPI)

```bash
cd backend

python3 -m venv .venv
source .venv/bin/activate      # (Windows: .venv\Scripts\activate)

pip install -r requirements.txt

uvicorn main:app --reload --port 8000
```

Backend should be running at:
- `http://127.0.0.1:8000`

Quick check:
- Open docs: `http://127.0.0.1:8000/docs`
- Health endpoint (if enabled): `GET /health`

---

## 3) Run the Frontend (Next.js)

Open a new terminal:

```bash
cd frontend
npm install
npm run dev
```

Frontend should be running at:
- `http://localhost:3000`

---

## 4) Connect Frontend → Backend
If your frontend expects an API base URL, set it like this:

Create `frontend/.env.local`:
```env
NEXT_PUBLIC_API_BASE=http://127.0.0.1:8000
```

Then restart `npm run dev`.

---

## ▶️ Using the App

### Simulation
- Choose algorithm + tick speed + quantum (if applicable)
- Start simulation
- Add processes live
- Switch between Focus Mode / Classic Mode
- Open Compare view to benchmark algorithms

### Full System Mode (CPU + Memory)
- Enable Full mode in simulation settings
- While adding processes, specify memory parameters (working set / address pattern etc.)
- Use Memory tab to view RAM + page tables + translation log

---

## 🛠 Common Issues / Fixes

### “404 /” on backend
This is normal unless you defined a root route.
Use `/docs` or the actual API endpoints.

### WebSocket not connecting
- Ensure backend is running on port 8000
- Ensure `.env.local` has correct `NEXT_PUBLIC_API_BASE`
- Check the WS path used in frontend (example: `/ws/state`)

### Port already in use
Change ports:
- Backend: `--port 8001`
- Frontend: `npm run dev -- -p 3001`
And update `NEXT_PUBLIC_API_BASE`.

---

## 📊 Metrics Tracked

- **WT (Waiting Time):** total time in ready queue
- **TAT (Turnaround Time):** completion − arrival
- **RT (Response Time):** first CPU start − arrival
- **CPU Utilization:** busy / total
- **Makespan:** last completion time
- **Throughput:** completed / makespan
- (Full mode) **Faults / Hits / Hit ratio**

---

## 🧪 Roadmap 
- More memory policies + page coloring visuals
- “Instruction-level” mode (per-process PC + deterministic reference strings)
- Export/Import workloads as JSON
- Playback controls + timeline scrubbing
- Deploy via Docker + cloud hosting

---

## 🤝 Contributing
PRs are welcome for:
- New algorithms
- Better visualizations
- Bug fixes and performance improvements

---

## 📄 License
Add a license if you want (MIT recommended). For coursework, you can omit.

---

## Author
**Arun Sanjay**
