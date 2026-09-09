import asyncio
import os
import time
import uuid
from typing import Any, Dict, List, Literal, Optional

from fastapi import FastAPI, HTTPException, Request, Response, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from src.agents.base import Agent
from src.cell import CellType
from src.db import add_score, get_high_score, get_top_scores, init_db
from src.direc import Direction
from src.mode import Mode
from src.pos import Pos
from src.snake import Snake

# Import AI Agents safely
try:
    from src.agents.graph import GraphAgent
except Exception:
    GraphAgent = None

try:
    from src.agents.rl import RLAgent
except Exception:
    RLAgent = None

# Initialize SQLite database
init_db()

app = FastAPI(title="Snake AI Game Server", version="2.2.0")

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


# Security Headers Middleware
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response: Response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response


# --- Pydantic Validation Models ---


class NewGameRequest(BaseModel):
    mode: Literal["human", "graph", "rl"] = "graph"
    grid_size: int = Field(6, ge=4, le=30)
    speed: int = Field(80, ge=20, le=2000)
    seed: Optional[int] = None


class MoveRequest(BaseModel):
    direction: Literal["UP", "DOWN", "LEFT", "RIGHT"]


class SpeedRequest(BaseModel):
    speed: int = Field(..., ge=20, le=2000)


class ResetRequest(BaseModel):
    seed: Optional[int] = None
    grid_size: Optional[int] = Field(None, ge=4, le=30)
    mode: Optional[Literal["human", "graph", "rl"]] = None


class SaveScoreRequest(BaseModel):
    player_name: str = Field(..., min_length=1, max_length=20, pattern=r"^[\w\s\-]+$")
    mode: Literal["human", "graph", "rl"]
    grid_size: int = Field(..., ge=4, le=30)
    score: int = Field(..., ge=0, le=10000)
    moves: int = Field(..., ge=0, le=100000)
    time_seconds: float = Field(..., ge=0.0, le=86400.0)


# --- Core Game Session Logic ---


class GameSession:
    def __init__(
        self,
        session_id: str,
        mode_str: str = "graph",
        grid_size: int = 6,
        speed: int = 80,
        seed: Optional[int] = None,
    ):
        self.session_id: str = session_id
        self.grid_size: int = max(4, min(grid_size, 30))
        self.speed: int = max(20, min(speed, 2000))
        self.seed: Optional[int] = seed
        self.paused: bool = False
        self.moves_count: int = 0
        self.food_eaten: int = 0
        self.start_time: float = time.time()
        self.queued_direction: Optional[Direction] = None

        self.mode: Mode = self._parse_mode(mode_str)
        self.agent: Optional[Agent] = self._init_agent(self.mode)
        self.snake: Snake = self._create_snake()

    def _parse_mode(self, mode_str: str) -> Mode:
        mode_str = mode_str.upper()
        if mode_str == "HUMAN":
            return Mode.HUMAN
        elif mode_str == "RL":
            return Mode.RL
        return Mode.GRAPH

    def _init_agent(self, mode: Mode) -> Optional[Agent]:
        if mode == Mode.GRAPH and GraphAgent is not None:
            return GraphAgent()
        elif mode == Mode.RL and RLAgent is not None:
            try:
                return RLAgent()
            except Exception:
                return None
        return None

    def _create_snake(self) -> Snake:
        init_coords = [Pos(1, 1), Pos(1, 2), Pos(1, 3)]
        init_cells = [CellType.BODY_HORZ, CellType.BODY_HORZ, CellType.HEAD_RIGHT]
        food_pos = Pos(self.grid_size - 2, self.grid_size - 2)
        return Snake(
            grid_size=self.grid_size,
            coords=init_coords,
            cells=init_cells,
            direc=Direction.RIGHT,
            food=food_pos,
            rand_seed=self.seed,
        )

    def set_direction(self, direction_str: str) -> bool:
        dir_map = {
            "UP": Direction.UP,
            "DOWN": Direction.DOWN,
            "LEFT": Direction.LEFT,
            "RIGHT": Direction.RIGHT,
        }
        direc = dir_map.get(direction_str.upper())
        if direc is not None:
            if not self.snake.direc.is_opposite(direc):
                self.queued_direction = direc
                return True
        return False

    def reset(
        self,
        seed: Optional[int] = None,
        grid_size: Optional[int] = None,
        mode_str: Optional[str] = None,
    ) -> None:
        if seed is not None:
            self.seed = seed
        if grid_size is not None:
            self.grid_size = max(4, min(grid_size, 30))
        if mode_str is not None:
            self.mode = self._parse_mode(mode_str)
            self.agent = self._init_agent(self.mode)
        elif self.agent is not None and hasattr(self.agent, "reset"):
            self.agent.reset()

        self.snake = self._create_snake()
        self.paused = False
        self.moves_count = 0
        self.food_eaten = 0
        self.queued_direction = None
        self.start_time = time.time()

    def get_ai_path(self) -> List[Dict[str, int]]:
        if self.mode != Mode.GRAPH or not isinstance(self.agent, GraphAgent):
            return []
        if not self.snake.food or self.snake.is_stopped():
            return []

        try:
            path = self.agent.shortest_path(self.snake.food, self.snake)
            if not path and self.snake.len() >= GraphAgent.HAMILTON_THRESHOLD:
                path = self.agent.hamilton_path(self.snake.tail(), self.snake)
            if not path:
                return []

            coords: List[Dict[str, int]] = []
            curr = self.snake.head()
            for d in path:
                curr = curr.adj(d)
                if not self.snake.is_out_of_bound(curr):
                    coords.append({"row": curr.row, "col": curr.col})
            return coords
        except Exception:
            return []

    def step(self) -> Dict[str, Any]:
        if self.snake.is_stopped() or self.paused:
            return self.get_state()

        next_direc = self.snake.direc
        if self.mode == Mode.HUMAN:
            if self.queued_direction is not None:
                next_direc = self.queued_direction
                self.queued_direction = None
        else:
            if self.agent is not None:
                try:
                    next_direc = self.agent.next_direc(self.snake)
                except Exception:
                    next_direc = self.snake.direc

        old_len = self.snake.len()
        self.snake.move(next_direc)
        self.moves_count += 1

        if self.snake.len() > old_len:
            self.food_eaten += 1

        return self.get_state()

    def get_state(self) -> Dict[str, Any]:
        coords_list = [{"row": p.row, "col": p.col} for p in self.snake.coords]
        cells_list = [c.name for c in self.snake.cells]
        food_dict = (
            {"row": self.snake.food.row, "col": self.snake.food.col}
            if self.snake.food
            else None
        )

        state_str = "WALKING"
        if self.snake.state == Snake.State.DEAD:
            state_str = "DEAD"
        elif self.snake.state == Snake.State.FULL:
            state_str = "FULL"

        db_high_score = get_high_score(self.mode.name.lower())

        return {
            "game_id": self.session_id,
            "mode": self.mode.name.lower(),
            "grid_size": self.grid_size,
            "speed": self.speed,
            "paused": self.paused,
            "score": self.snake.len(),
            "food_eaten": self.food_eaten,
            "max_score": self.grid_size**2,
            "length": self.snake.len(),
            "moves": self.moves_count,
            "state": state_str,
            "direction": self.snake.direc.name,
            "snake_coords": coords_list,
            "snake_cells": cells_list,
            "food": food_dict,
            "ai_path": self.get_ai_path(),
            "elapsed_seconds": round(time.time() - self.start_time, 1),
            "high_score": max(db_high_score, self.snake.len()),
        }


# In-memory sessions storage
sessions: Dict[str, GameSession] = {}


def get_or_create_session(game_id: Optional[str] = None) -> GameSession:
    if game_id and game_id in sessions:
        return sessions[game_id]
    new_id = game_id or str(uuid.uuid4())[:8]
    session = GameSession(session_id=new_id)
    sessions[new_id] = session
    return session


# --- REST API Endpoints ---


@app.get("/api/health")
def health_check():
    return {"status": "ok", "timestamp": time.time()}


@app.get("/api/game/modes")
def list_modes():
    modes = [
        {
            "id": "human",
            "name": "Human Player",
            "description": "Control the snake manually with swipe gestures, touch D-pad, or keyboard.",
            "available": True,
            "icon": "👤",
        },
        {
            "id": "graph",
            "name": "Graph AI (Hamiltonian & Shortest Path)",
            "description": "Graph search algorithm calculating shortest paths and Hamiltonian cycles.",
            "available": GraphAgent is not None,
            "icon": "🧠",
        },
        {
            "id": "rl",
            "name": "Reinforcement Learning (DQN)",
            "description": "Deep Q-Network AI agent trained with PyTorch.",
            "available": RLAgent is not None,
            "icon": "🤖",
        },
    ]
    return {"modes": modes}


@app.post("/api/game/new")
def new_game(req: NewGameRequest):
    game_id = str(uuid.uuid4())[:8]
    session = GameSession(
        session_id=game_id,
        mode_str=req.mode,
        grid_size=req.grid_size,
        speed=req.speed,
        seed=req.seed,
    )
    sessions[game_id] = session
    return session.get_state()


@app.get("/api/game/{game_id}/state")
def get_game_state(game_id: str):
    if game_id not in sessions:
        raise HTTPException(status_code=404, detail="Game session not found")
    return sessions[game_id].get_state()


@app.post("/api/game/{game_id}/move")
def post_move(game_id: str, req: MoveRequest):
    if game_id not in sessions:
        raise HTTPException(status_code=404, detail="Game session not found")
    success = sessions[game_id].set_direction(req.direction)
    return {"success": success, "state": sessions[game_id].get_state()}


@app.post("/api/game/{game_id}/step")
def post_step(game_id: str):
    if game_id not in sessions:
        raise HTTPException(status_code=404, detail="Game session not found")
    return sessions[game_id].step()


@app.post("/api/game/{game_id}/pause")
def post_pause(game_id: str):
    if game_id not in sessions:
        raise HTTPException(status_code=404, detail="Game session not found")
    session = sessions[game_id]
    session.paused = not session.paused
    return session.get_state()


@app.post("/api/game/{game_id}/speed")
def post_speed(game_id: str, req: SpeedRequest):
    if game_id not in sessions:
        raise HTTPException(status_code=404, detail="Game session not found")
    session = sessions[game_id]
    session.speed = req.speed
    return session.get_state()


@app.post("/api/game/{game_id}/reset")
def post_reset(game_id: str, req: ResetRequest):
    if game_id not in sessions:
        raise HTTPException(status_code=404, detail="Game session not found")
    session = sessions[game_id]
    session.reset(seed=req.seed, grid_size=req.grid_size, mode_str=req.mode)
    return session.get_state()


# --- Database High Score Endpoints ---


@app.get("/api/scores")
def list_high_scores(limit: int = 10, mode: Optional[str] = None):
    scores = get_top_scores(limit=limit, mode=mode)
    return {"scores": scores}


@app.post("/api/scores")
def record_score(req: SaveScoreRequest):
    result = add_score(
        player_name=req.player_name,
        mode=req.mode,
        grid_size=req.grid_size,
        score=req.score,
        moves=req.moves,
        time_seconds=req.time_seconds,
    )
    return {"success": True, "score": result}


@app.get("/api/scores/top")
def get_top_score(mode: Optional[str] = None):
    top = get_high_score(mode=mode)
    return {"high_score": top}


# --- Real-Time WebSocket Streaming ---


@app.websocket("/ws/game/{game_id}")
async def websocket_game(websocket: WebSocket, game_id: str):
    await websocket.accept()
    session = get_or_create_session(game_id)

    # Initial state
    await websocket.send_json({"type": "STATE", "data": session.get_state()})

    async def game_loop():
        last_tick = time.time()
        while True:
            try:
                now = time.time()
                interval = session.speed / 1000.0
                if not session.paused and not session.snake.is_stopped():
                    if now - last_tick >= interval:
                        old_len = session.snake.len()
                        state = session.step()
                        last_tick = now

                        if session.snake.len() > old_len:
                            await websocket.send_json(
                                {"type": "EVENT", "event": "FOOD_EATEN", "data": state}
                            )
                        if session.snake.is_stopped():
                            await websocket.send_json(
                                {
                                    "type": "EVENT",
                                    "event": "GAME_OVER",
                                    "reason": state["state"],
                                    "data": state,
                                }
                            )

                        await websocket.send_json({"type": "STATE", "data": state})
                await asyncio.sleep(0.01)
            except asyncio.CancelledError:
                break
            except Exception:
                break

    loop_task = asyncio.create_task(game_loop())

    try:
        while True:
            msg = await websocket.receive_json()
            msg_type = str(msg.get("type", "")).upper()

            if msg_type == "MOVE":
                direc = str(msg.get("direction", ""))
                if direc in ["UP", "DOWN", "LEFT", "RIGHT"]:
                    session.set_direction(direc)
            elif msg_type == "SET_SPEED":
                speed = int(msg.get("speed", 80))
                session.speed = max(20, min(speed, 2000))
            elif msg_type == "PAUSE":
                session.paused = True
            elif msg_type == "RESUME":
                session.paused = False
            elif msg_type == "TOGGLE_PAUSE":
                session.paused = not session.paused
            elif msg_type == "STEP":
                state = session.step()
                await websocket.send_json({"type": "STATE", "data": state})
            elif msg_type == "RESET":
                grid_size = msg.get("grid_size")
                if grid_size is not None:
                    grid_size = max(4, min(int(grid_size), 30))
                session.reset(
                    seed=msg.get("seed"),
                    grid_size=grid_size,
                    mode_str=msg.get("mode"),
                )
                await websocket.send_json(
                    {"type": "STATE", "data": session.get_state()}
                )
            elif msg_type == "CHANGE_MODE":
                session.reset(mode_str=msg.get("mode"))
                await websocket.send_json(
                    {"type": "STATE", "data": session.get_state()}
                )

            if msg_type in [
                "MOVE",
                "SET_SPEED",
                "PAUSE",
                "RESUME",
                "TOGGLE_PAUSE",
                "CHANGE_MODE",
            ]:
                await websocket.send_json(
                    {"type": "STATE", "data": session.get_state()}
                )

    except WebSocketDisconnect:
        loop_task.cancel()
    except Exception:
        loop_task.cancel()


# --- Static Files & Index ---

BASE_DIR = os.path.dirname(os.path.abspath(__file__))


@app.get("/")
def serve_index():
    index_path = os.path.join(BASE_DIR, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"message": "index.html not found"}


@app.get("/style.css")
def serve_css():
    css_path = os.path.join(BASE_DIR, "style.css")
    if os.path.exists(css_path):
        return FileResponse(css_path, media_type="text/css")
    raise HTTPException(status_code=404, detail="style.css not found")


@app.get("/app.js")
def serve_js():
    js_path = os.path.join(BASE_DIR, "app.js")
    if os.path.exists(js_path):
        return FileResponse(js_path, media_type="application/javascript")
    raise HTTPException(status_code=404, detail="app.js not found")


if __name__ == "__main__":
    import uvicorn

    print("\nStarting Snake AI FastAPI Server at http://127.0.0.1:8000 ...\n")
    uvicorn.run("server:app", host="127.0.0.1", port=8000, reload=True)
