"""Расширенный API общественного режима:
  GET  /public/fifteen-min            — индекс 15-мин города
  POST /public/compare                — сравнение районов бок о бок
  POST /public/developer-check        — оценка нагрузки нового ЖК
  POST /public/developer-check/pdf    — тот же отчёт в PDF (премиум)
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from urllib.parse import quote

from app.database import get_db
from app.services.developer_pdf import render_developer_pdf
from app.services.public_advanced import (
    compare_districts, developer_pre_check, fifteen_min_city,
)

router = APIRouter(prefix="/public")


@router.get("/fifteen-min")
def fifteen_min_endpoint(db: Session = Depends(get_db)):
    import logging
    log = logging.getLogger(__name__)
    try:
        return fifteen_min_city(db)
    except Exception as e:
        log.exception("/public/fifteen-min failed: %s", e)
        return {
            "city_avg_score": 0,
            "districts": [],
            "methodology": "",
            "generated_at": "",
            "error": f"db_unavailable: {e.__class__.__name__}",
        }


class CompareRequest(BaseModel):
    district_ids: list[int] = Field(..., min_length=2, max_length=4)


@router.post("/compare")
def compare_endpoint(req: CompareRequest, db: Session = Depends(get_db)):
    r = compare_districts(db, req.district_ids)
    if not r["districts"]:
        raise HTTPException(400, "No valid districts provided")
    return r


class DeveloperCheckRequest(BaseModel):
    district: str
    apartments: int = Field(..., ge=10, le=50_000)
    class_type: str = Field("comfort", pattern="^(economy|comfort|business|premium)$")
    has_own_school: bool = False
    has_own_kindergarten: bool = False
    has_own_clinic: bool = False


@router.post("/developer-check")
def developer_check_endpoint(req: DeveloperCheckRequest, db: Session = Depends(get_db)):
    r = developer_pre_check(
        db, req.district, req.apartments, req.class_type,  # type: ignore[arg-type]
        req.has_own_school, req.has_own_kindergarten, req.has_own_clinic,
    )
    if "error" in r:
        raise HTTPException(404, r["error"])
    return r


@router.post("/developer-check/pdf")
def developer_check_pdf(req: DeveloperCheckRequest, db: Session = Depends(get_db)):
    report = developer_pre_check(
        db, req.district, req.apartments, req.class_type,  # type: ignore[arg-type]
        req.has_own_school, req.has_own_kindergarten, req.has_own_clinic,
    )
    if "error" in report:
        raise HTTPException(404, report["error"])

    pdf = render_developer_pdf(report)
    pretty = f"AQYL_DeveloperCheck_{req.district}_{req.apartments}apts.pdf"
    disposition = (
        f'attachment; filename="AQYL_DeveloperCheck.pdf"; '
        f"filename*=UTF-8''{quote(pretty)}"
    )
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": disposition},
    )
