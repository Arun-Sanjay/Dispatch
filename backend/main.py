from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes_sim import router as sim_router
from app.api.ws import router as ws_router

app = FastAPI(title="CPU Scheduling Visualizer API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(sim_router)
app.include_router(ws_router)


@app.get("/health")
def health():
    return {"ok": True}

@app.get("/")
def root():
    return {"ok": True, "hint": "Use /health, /docs, or /sim/state"}