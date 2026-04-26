"""API для AI Business Plan Generator — платная фича бизнес-режима."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.business_plan import PlanRequest, generate_plan
from app.services.business_plan_pdf import render_plan_pdf


router = APIRouter(prefix="/business/plan")


class PlanRequestModel(BaseModel):
    category: str = Field(..., description="BusinessCategory value")
    district: str | None = Field(None, description="Название района или null — автоподбор")
    budget_usd: float = Field(30_000, ge=1_000, le=5_000_000)
    area_m2: float = Field(80, ge=10, le=5_000)
    experience: str = Field("some", pattern="^(none|some|experienced)$")
    language: str = Field("ru", pattern="^(ru|kz|en)$")
    concept: str | None = Field(None, max_length=500)


# --- Простая in-memory квота для демо (в проде — Redis) ---
# Free tier: 3 плана в час на IP.
_quota: dict[str, list[float]] = {}
FREE_QUOTA_PER_HOUR = 3


def _check_quota(ip: str) -> tuple[bool, int]:
    import time
    now = time.time()
    window = 3600
    history = [t for t in _quota.get(ip, []) if now - t < window]
    _quota[ip] = history
    remaining = max(0, FREE_QUOTA_PER_HOUR - len(history))
    return remaining > 0, remaining


def _tick_quota(ip: str) -> int:
    import time
    _quota.setdefault(ip, []).append(time.time())
    return max(0, FREE_QUOTA_PER_HOUR - len(_quota[ip]))


@router.get("/quota")
def get_quota(request: Request):
    """Проверить сколько бесплатных планов осталось в текущем часу."""
    ip = request.client.host if request.client else "unknown"
    _, remaining = _check_quota(ip)
    return {
        "tier": "free",
        "quota_per_hour": FREE_QUOTA_PER_HOUR,
        "remaining": remaining,
        "upgrade_url": "/pricing",
    }


@router.post("/generate")
def generate(req: PlanRequestModel, request: Request, db: Session = Depends(get_db)):
    """Сгенерировать бизнес-план. Возвращает markdown + summary + finance."""
    ip = request.client.host if request.client else "unknown"
    ok, remaining = _check_quota(ip)
    if not ok:
        raise HTTPException(
            429,
            detail={
                "error": "free_quota_exceeded",
                "message": f"Исчерпан бесплатный лимит ({FREE_QUOTA_PER_HOUR}/час). "
                           "Апгрейд до Pro — безлимит за $29/мес.",
                "upgrade_url": "/pricing",
            },
        )

    result = generate_plan(db, PlanRequest(
        category=req.category,
        district=req.district,
        budget_usd=req.budget_usd,
        area_m2=req.area_m2,
        experience=req.experience,  # type: ignore[arg-type]
        language=req.language,      # type: ignore[arg-type]
        concept=req.concept,
    ))
    if "error" in result:
        raise HTTPException(400, result)

    new_remaining = _tick_quota(ip)
    result["quota"] = {"remaining": new_remaining, "tier": "free"}
    return result


@router.post("/pdf")
def plan_to_pdf(req: PlanRequestModel, request: Request, db: Session = Depends(get_db)):
    """Сгенерировать план и вернуть PDF-файл (application/pdf)."""
    ip = request.client.host if request.client else "unknown"
    ok, _ = _check_quota(ip)
    if not ok:
        raise HTTPException(429, "free_quota_exceeded")

    plan = generate_plan(db, PlanRequest(
        category=req.category,
        district=req.district,
        budget_usd=req.budget_usd,
        area_m2=req.area_m2,
        experience=req.experience,  # type: ignore[arg-type]
        language=req.language,      # type: ignore[arg-type]
        concept=req.concept,
    ))
    if "error" in plan:
        raise HTTPException(400, plan)

    _tick_quota(ip)
    pdf_bytes = render_plan_pdf(plan)

    # HTTP headers — ASCII only. Для UTF-8 используем filename*=UTF-8''...
    from urllib.parse import quote
    cat_ru = plan["summary"].get("category_label", "plan")
    district_ru = plan["summary"].get("district") or "Алматы"
    pretty = f"AQYL_BizPlan_{cat_ru}_{district_ru}.pdf"
    ascii_fallback = "AQYL_BizPlan.pdf"

    disposition = (
        f'attachment; filename="{ascii_fallback}"; '
        f"filename*=UTF-8''{quote(pretty)}"
    )

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": disposition},
    )
