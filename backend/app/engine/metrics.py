from typing import List

from .models import Process


def compute_metrics(processes: List[Process]):
    """Return per-process metric rows.

    - Always returns a row for every process (so the table can list all tasks).
    - Averages are computed only across completed processes.
    """
    rows = []
    completed_rows = []

    # Stable ordering for display
    for p in sorted(processes, key=lambda x: (x.arrival_time, x.pid)):
        st = p.start_time
        ct = p.completion_time

        if st is not None and ct is not None:
            tat = ct - p.arrival_time
            wt = tat - p.burst_time
            rt = st - p.arrival_time
            row = {
                "PID": p.pid,
                "AT": p.arrival_time,
                "BT": p.burst_time,
                "PR": p.priority,
                "Q": p.queue,
                "ST": st,
                "CT": ct,
                "TAT": tat,
                "WT": wt,
                "RT": rt,
                "_done": True,
            }
            completed_rows.append(row)
        else:
            # Not finished yet (or not started). Keep placeholders.
            row = {
                "PID": p.pid,
                "AT": p.arrival_time,
                "BT": p.burst_time,
                "PR": p.priority,
                "Q": p.queue,
                "ST": "-" if st is None else st,
                "CT": "-" if ct is None else ct,
                "TAT": "-",
                "WT": "-",
                "RT": "-" if st is None else (st - p.arrival_time),
                "_done": False,
            }

        rows.append(row)

    if completed_rows:
        avg_wt = sum(r["WT"] for r in completed_rows) / len(completed_rows)
        avg_tat = sum(r["TAT"] for r in completed_rows) / len(completed_rows)
        avg_rt = sum(r["RT"] for r in completed_rows) / len(completed_rows)
    else:
        avg_wt = avg_tat = avg_rt = 0.0

    return rows, avg_wt, avg_tat, avg_rt
