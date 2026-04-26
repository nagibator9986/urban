"""AI-помощник и AI-отчёты."""

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Path
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.ai_assistant import chat, generate_report

router = APIRouter(prefix="/ai")

Mode = Literal["public", "business", "eco"]


class ChatHistoryItem(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(..., min_length=1, max_length=4000)


class ChatRequest(BaseModel):
    mode: Mode = Field(..., description="Режим: public | business | eco")
    message: str = Field(..., min_length=1, max_length=1000)
    district_focus: str | None = None
    simulator_state: dict | None = None
    user_profile: dict | None = None
    history: list[ChatHistoryItem] = Field(default_factory=list, max_length=20)


@router.post("/chat")
def ai_chat(req: ChatRequest, db: Session = Depends(get_db)):
    try:
        return chat(
            db, req.mode, req.message,
            district_focus=req.district_focus,
            simulator_state=req.simulator_state,
            user_profile=req.user_profile,
            history=[h.model_dump() for h in req.history],
        )
    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=502, detail=f"ai_chat_failed: {exc}")


@router.get("/report/{mode}")
def ai_report(
    mode: Mode = Path(..., description="public | business | eco"),
    db: Session = Depends(get_db),
):
    try:
        return generate_report(db, mode)
    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=502, detail=f"ai_report_failed: {exc}")
