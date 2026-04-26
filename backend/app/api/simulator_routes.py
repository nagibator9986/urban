"""API симулятора what-if — добавить/удалить соц.объекты и пересчитать."""

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from io import BytesIO

from app.database import get_db
from app.services.simulator import simulate_district
from app.services.simulator_advanced import (
    auto_plan_pareto, auto_plan_to_grade_a, build_simulation_pdf,
)

router = APIRouter(prefix="/simulate")


class SimRequest(BaseModel):
    district_id: int = Field(..., ge=1)
    additions: dict[str, int] = Field(default_factory=dict)
    removals: dict[str, int] = Field(default_factory=dict)


@router.post("/district")
def simulate(req: SimRequest, db: Session = Depends(get_db)):
    result = simulate_district(db, req.district_id, req.additions, req.removals)
    if isinstance(result, dict) and result.get("error") == "district_not_found":
        raise HTTPException(status_code=404, detail="district_not_found")
    return result


@router.get("/auto-plan/{district_id}")
def auto_plan_endpoint(
    district_id: int,
    target_score: int = Query(85, ge=30, le=95),
    db: Session = Depends(get_db),
):
    """Smart autocomplete: минимум объектов для грейда A (по умолчанию score ≥ 85)."""
    r = auto_plan_to_grade_a(db, district_id, target_score)
    if "error" in r:
        raise HTTPException(404, r["error"])
    return r


@router.get("/auto-plan/{district_id}/pareto")
def auto_plan_pareto_endpoint(district_id: int, db: Session = Depends(get_db)):
    """Pareto-frontier: 3 плана (cheap/balanced/premium) с tradeoff cost vs score."""
    r = auto_plan_pareto(db, district_id)
    if "error" in r:
        raise HTTPException(404, r["error"])
    return r


class PDFRequest(BaseModel):
    district_id: int = Field(..., ge=1)
    additions: dict[str, int] = Field(default_factory=dict)
    removals: dict[str, int] = Field(default_factory=dict)
    author: str | None = None


@router.post("/district/pdf")
def simulate_pdf(req: PDFRequest, db: Session = Depends(get_db)):
    """PDF-экспорт what-if симуляции (для акимата/банка)."""
    try:
        pdf_bytes = build_simulation_pdf(
            db, req.district_id, req.additions, req.removals, req.author,
        )
    except ValueError as e:
        raise HTTPException(404, str(e))
    buf = BytesIO(pdf_bytes)
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={
            "Content-Disposition":
                f'attachment; filename="aqyl-simulation-district-{req.district_id}.pdf"',
        },
    )
