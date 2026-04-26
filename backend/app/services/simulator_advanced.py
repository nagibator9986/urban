"""Auto-plan (минимум объектов для грейда A) + PDF-экспорт симуляции."""

from __future__ import annotations

import math
from datetime import datetime

from sqlalchemy.orm import Session

from app.models.district import District
from app.services.norms import NORMS
from app.services.simulator import simulate_district, _district_counts
from app.services.statistics import (
    STAT_TYPES, _compute_facility_stat, _load_latest_populations, _overall_score,
)

# Reuse capex ranges documented in public_advanced for developer-check
TYPICAL_CAPEX_USD = {
    "school":        {"min": 4_000_000, "max": 7_000_000,  "label": "$4-7 млн"},
    "kindergarten":  {"min": 1_000_000, "max": 2_000_000,  "label": "$1-2 млн"},
    "clinic":        {"min": 2_000_000, "max": 4_000_000,  "label": "$2-4 млн"},
    "hospital":      {"min": 10_000_000, "max": 25_000_000, "label": "$10-25 млн"},
    "pharmacy":      {"min": 100_000,   "max": 300_000,    "label": "$100-300 тыс"},
    "park":          {"min": 200_000,   "max": 800_000,    "label": "$200-800 тыс"},
    "bus_stop":      {"min": 5_000,     "max": 20_000,     "label": "$5-20 тыс"},
    "fire_station":  {"min": 1_500_000, "max": 4_000_000,  "label": "$1.5-4 млн"},
}


def _greedy_plan(
    population: int, current: dict[str, int], target_score: int,
    max_steps: int = 60,
) -> dict:
    """Helper: greedy fill towards target_score. Returns dict with all relevant data."""
    added: dict[str, int] = {}
    score_history: list[dict] = []
    working = dict(current)

    def _score_with(counts: dict[str, int]) -> tuple[float, list]:
        stats = [
            _compute_facility_stat(ft, counts.get(ft.value, 0), population)
            for ft in STAT_TYPES
        ]
        return _overall_score(stats), stats

    init_score, init_stats = _score_with(working)
    score_history.append({"step": 0, "score": init_score, "added": dict(added)})

    step = 0
    reached_at: int | None = None
    while step < max_steps:
        score, stats = _score_with(working)
        if score >= target_score:
            reached_at = step
            break

        candidates = [
            (s.facility_type, s.coverage_percent, s.deficit)
            for s in stats
            if s.norm_per_10k > 0 and s.coverage_percent < 100
        ]
        if not candidates:
            break
        candidates.sort(key=lambda x: (x[1], -x[2]))
        chosen = candidates[0][0]
        working[chosen] = working.get(chosen, 0) + 1
        added[chosen] = added.get(chosen, 0) + 1
        step += 1
        score_history.append({"step": step, "score": round(score, 1), "added": dict(added)})

    final_score, final_stats = _score_with(working)
    return {
        "added": added,
        "score_history": score_history,
        "init_score": init_score,
        "init_stats": init_stats,
        "final_score": final_score,
        "final_stats": final_stats,
        "steps_taken": step,
        "reached_target": reached_at is not None,
    }


def _capex_for_additions(adds: dict[str, int]) -> dict:
    """Compute CAPEX min/max + line items for a set of additions."""
    total_min = 0
    total_max = 0
    lines = []
    for k, n in adds.items():
        cap = TYPICAL_CAPEX_USD.get(k)
        if not cap:
            continue
        line_min = cap["min"] * n
        line_max = cap["max"] * n
        total_min += line_min
        total_max += line_max
        lines.append({
            "facility_type": k,
            "label": NORMS[k].label_ru if k in NORMS else k,
            "count": n,
            "unit_capex_label": cap["label"],
            "line_min_usd": line_min,
            "line_max_usd": line_max,
        })
    return {
        "lines": lines,
        "total_min_usd": total_min,
        "total_max_usd": total_max,
        "currency": "USD",
    }


def auto_plan_to_grade_a(
    db: Session, district_id: int, target_score: int = 85,
) -> dict:
    """Найти минимальный набор объектов для достижения overall_score ≥ target.

    Жадный алгоритм: на каждом шаге добавляем объект типа с наименьшим
    coverage_percent. Capex по TYPICAL_CAPEX_USD.
    """
    target_score = max(30, min(target_score, 95))

    d = db.query(District).filter_by(id=district_id).first()
    if not d:
        return {"error": "district_not_found"}

    all_districts = db.query(District).all()
    pops = _load_latest_populations(db, [x.id for x in all_districts])
    total_pop = sum(pops.values()) or 1
    population = pops.get(district_id, 0)
    pop_share = population / total_pop

    current = _district_counts(db, district_id, pop_share)
    plan = _greedy_plan(population, current, target_score)
    capex = _capex_for_additions(plan["added"])

    return {
        "district_id": district_id,
        "district_name": d.name_ru,
        "population": population,
        "target_score": target_score,
        "reached_target": plan["reached_target"],
        "steps_taken": plan["steps_taken"],
        "initial_score": plan["init_score"],
        "final_score": plan["final_score"],
        "additions": plan["added"],
        "score_history": plan["score_history"],
        "facility_before": [
            {"facility_type": s.facility_type, "label": s.label_ru,
             "actual_count": s.actual_count, "coverage_percent": s.coverage_percent,
             "deficit": s.deficit}
            for s in plan["init_stats"]
        ],
        "facility_after": [
            {"facility_type": s.facility_type, "label": s.label_ru,
             "actual_count": s.actual_count, "coverage_percent": s.coverage_percent,
             "deficit": s.deficit}
            for s in plan["final_stats"]
        ],
        "capex_estimate": capex,
        "methodology": (
            "Жадный поиск: на каждом шаге добавляем объект типа с наименьшим "
            "текущим coverage_percent. Capex ранжируется по TYPICAL_CAPEX_USD — "
            "реальные диапазоны 2024 (открытые данные по госзакупкам РК + benchmarks)."
        ),
        "generated_at": datetime.utcnow().isoformat() + "Z",
    }


def auto_plan_pareto(
    db: Session, district_id: int,
) -> dict:
    """Pareto-frontier авто-план: 3 решения с разными trade-offs.

    Возвращает:
      - cheap   (target=70):    минимум объектов до грейда B (~70)
      - balanced (target=85):    стандартный план до грейда A (~85)
      - premium (target=95):    максимум, грейд A+ (~95+)

    Все три решения вычисляются с одной базы (current district counts).
    """
    d = db.query(District).filter_by(id=district_id).first()
    if not d:
        return {"error": "district_not_found"}

    all_districts = db.query(District).all()
    pops = _load_latest_populations(db, [x.id for x in all_districts])
    total_pop = sum(pops.values()) or 1
    population = pops.get(district_id, 0)
    pop_share = population / total_pop

    current = _district_counts(db, district_id, pop_share)

    plans_meta = [
        {
            "key": "cheap", "label": "💰 Бюджетный",
            "description": "Минимум объектов до грейда B (≥70)",
            "target_score": 70,
            "color": "#22D3EE",
        },
        {
            "key": "balanced", "label": "⚖️ Сбалансированный",
            "description": "Грейд A (≥85) — рекомендуется",
            "target_score": 85,
            "color": "#2DD4BF",
        },
        {
            "key": "premium", "label": "⭐ Премиум",
            "description": "Грейд A+ (≥95) — максимальный комфорт",
            "target_score": 95,
            "color": "#10B981",
        },
    ]

    plan_results = []
    for meta in plans_meta:
        plan = _greedy_plan(population, current, meta["target_score"])
        capex = _capex_for_additions(plan["added"])
        total_objects = sum(plan["added"].values())
        plan_results.append({
            "key": meta["key"],
            "label": meta["label"],
            "description": meta["description"],
            "target_score": meta["target_score"],
            "color": meta["color"],
            "reached_target": plan["reached_target"],
            "final_score": plan["final_score"],
            "score_delta": round(plan["final_score"] - plan["init_score"], 1),
            "additions": plan["added"],
            "total_objects": total_objects,
            "steps_taken": plan["steps_taken"],
            "capex_estimate": capex,
        })

    return {
        "district_id": district_id,
        "district_name": d.name_ru,
        "population": population,
        "initial_score": plan_results[0]["final_score"]
            if plan_results[0]["target_score"] <= plan_results[0]["final_score"]
            else None,  # not very useful, will overwrite below
        "current_score": _greedy_plan(population, current, 0)["init_score"],
        "plans": plan_results,
        "methodology": (
            "3-плановый Pareto-frontier по жадному алгоритму. Каждый план — "
            "минимальное число объектов до своего target_score. CAPEX из "
            "TYPICAL_CAPEX_USD (open-data госзакупки РК 2024 + benchmarks)."
        ),
        "generated_at": datetime.utcnow().isoformat() + "Z",
    }


# ----------------------------------------------------------------------
# PDF-экспорт симуляции what-if
# ----------------------------------------------------------------------

def build_simulation_pdf(
    db: Session, district_id: int,
    additions: dict[str, int], removals: dict[str, int] | None = None,
    author: str | None = None,
) -> bytes:
    """Собирает PDF-отчёт по результату симуляции what-if."""
    from reportlab.lib.colors import HexColor
    from reportlab.lib.enums import TA_CENTER, TA_LEFT
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import cm
    from reportlab.platypus import (
        BaseDocTemplate, Frame, PageTemplate, Paragraph, Spacer, Table, TableStyle,
    )
    from io import BytesIO

    from app.services.business_plan_pdf import _register_fonts_once

    _register_fonts_once()

    sim = simulate_district(db, district_id, additions, removals or {})
    if "error" in sim:
        raise ValueError(sim["error"])

    # CAPEX using typical costs
    capex_min_total = 0
    capex_max_total = 0
    capex_lines = []
    for k, n in (additions or {}).items():
        cap = TYPICAL_CAPEX_USD.get(k)
        if not cap:
            continue
        capex_min_total += cap["min"] * n
        capex_max_total += cap["max"] * n
        capex_lines.append((
            NORMS[k].label_ru if k in NORMS else k, n, cap["label"],
            cap["min"] * n, cap["max"] * n,
        ))

    # Styles
    C_MINT = HexColor("#2DD4BF")
    C_TEXT = HexColor("#1B2432")
    C_MUTED = HexColor("#64748B")
    C_BORDER = HexColor("#E2E8F0")
    C_SUCCESS = HexColor("#10B981")
    C_DANGER = HexColor("#EF4444")

    H1 = ParagraphStyle("H1", fontName="UI-Bold", fontSize=18, leading=22,
                        textColor=C_TEXT, spaceAfter=8)
    H2 = ParagraphStyle("H2", fontName="UI-Bold", fontSize=13, leading=17,
                        textColor=C_MINT, spaceAfter=6, spaceBefore=12)
    Body = ParagraphStyle("Body", fontName="UI", fontSize=10, leading=14,
                          textColor=C_TEXT, alignment=TA_LEFT, spaceAfter=4)
    Small = ParagraphStyle("Small", fontName="UI", fontSize=9, leading=12,
                           textColor=C_MUTED, spaceAfter=3)
    Kpi = ParagraphStyle("Kpi", fontName="UI-Bold", fontSize=22, leading=24,
                         textColor=C_MINT, alignment=TA_CENTER)

    buf = BytesIO()
    doc = BaseDocTemplate(
        buf, pagesize=A4,
        leftMargin=2 * cm, rightMargin=2 * cm,
        topMargin=2 * cm, bottomMargin=2 * cm,
    )
    frame = Frame(
        doc.leftMargin, doc.bottomMargin,
        doc.width, doc.height, id="main",
    )
    doc.addPageTemplates([PageTemplate(id="main", frames=[frame])])

    elements: list = []

    elements.append(Paragraph("AQYL CITY · What-if симулятор", H1))
    elements.append(Paragraph(
        f"Район: <b>{sim['district_name']}</b> · Население: "
        f"{sim['population']:,} чел.".replace(",", " "),
        Body,
    ))
    elements.append(Paragraph(
        f"Сформировано: {datetime.utcnow().strftime('%Y-%m-%d %H:%M')} UTC",
        Small,
    ))

    # KPI row
    elements.append(Spacer(1, 8))
    kpi_data = [[
        Paragraph(f"{sim['before']['score']}", Kpi),
        Paragraph(f"{sim['after']['score']}", Kpi),
        Paragraph(
            f"{'+' if sim['delta_score'] >= 0 else ''}{sim['delta_score']}",
            ParagraphStyle(
                "D", parent=Kpi,
                textColor=C_SUCCESS if sim['delta_score'] >= 0 else C_DANGER,
            ),
        ),
    ], [
        Paragraph("Оценка ДО", Small),
        Paragraph("Оценка ПОСЛЕ", Small),
        Paragraph("Δ", Small),
    ]]
    kpi_table = Table(kpi_data, colWidths=[5.5 * cm, 5.5 * cm, 5.5 * cm])
    kpi_table.setStyle(TableStyle([
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("BOX",   (0, 0), (-1, -1), 0.3, C_BORDER),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    elements.append(kpi_table)

    # Additions
    elements.append(Paragraph("Планируемые дополнения", H2))
    if additions:
        data_rows = [["Тип", "Количество"]]
        for k, n in additions.items():
            data_rows.append([
                NORMS[k].label_ru if k in NORMS else k,
                str(n),
            ])
        t = Table(data_rows, colWidths=[11 * cm, 5 * cm])
        t.setStyle(TableStyle([
            ("FONTNAME", (0, 0), (-1, 0), "UI-Bold"),
            ("FONTNAME", (0, 1), (-1, -1), "UI"),
            ("FONTSIZE", (0, 0), (-1, -1), 10),
            ("BACKGROUND", (0, 0), (-1, 0), HexColor("#F1F5F9")),
            ("GRID", (0, 0), (-1, -1), 0.3, C_BORDER),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]))
        elements.append(t)
    else:
        elements.append(Paragraph("<i>Нет дополнений.</i>", Body))

    # Coverage changes per facility type
    elements.append(Paragraph("Покрытие нормативов: ДО → ПОСЛЕ", H2))
    cov_rows = [["Тип", "Было", "Стало", "%% покрытия"]]
    for b, a in zip(sim["before"]["facilities"], sim["after"]["facilities"]):
        label = b.get("label_ru") if isinstance(b, dict) else str(b)
        before_cnt = b["actual_count"] if isinstance(b, dict) else "?"
        after_cnt = a["actual_count"] if isinstance(a, dict) else "?"
        before_cov = b["coverage_percent"] if isinstance(b, dict) else 0
        after_cov = a["coverage_percent"] if isinstance(a, dict) else 0
        delta_cov = after_cov - before_cov
        cov_rows.append([
            label,
            str(before_cnt),
            f"{after_cnt} ({'+' if delta_cov >= 0 else ''}{delta_cov:.1f}%)",
            f"{after_cov:.1f}%",
        ])
    t_cov = Table(cov_rows, colWidths=[6 * cm, 3 * cm, 4 * cm, 3 * cm])
    t_cov.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, 0), "UI-Bold"),
        ("FONTNAME", (0, 1), (-1, -1), "UI"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("BACKGROUND", (0, 0), (-1, 0), HexColor("#F1F5F9")),
        ("GRID", (0, 0), (-1, -1), 0.2, C_BORDER),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    elements.append(t_cov)

    # CAPEX
    if capex_lines:
        elements.append(Paragraph("Ориентировочный CAPEX", H2))
        rows = [["Тип", "Кол-во", "Цена/ед.", "Мин USD", "Макс USD"]]
        for label, n, cap, lmin, lmax in capex_lines:
            rows.append([label, str(n), cap, f"{lmin:,}".replace(",", " "),
                         f"{lmax:,}".replace(",", " ")])
        rows.append([
            "ИТОГО", "", "",
            f"{capex_min_total:,}".replace(",", " "),
            f"{capex_max_total:,}".replace(",", " "),
        ])
        t_cap = Table(rows, colWidths=[5 * cm, 2 * cm, 3.5 * cm, 3 * cm, 3 * cm])
        t_cap.setStyle(TableStyle([
            ("FONTNAME", (0, 0), (-1, 0), "UI-Bold"),
            ("FONTNAME", (0, 1), (-1, -2), "UI"),
            ("FONTNAME", (0, -1), (-1, -1), "UI-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("BACKGROUND", (0, 0), (-1, 0), HexColor("#F1F5F9")),
            ("BACKGROUND", (0, -1), (-1, -1), HexColor("#ECFDF5")),
            ("GRID", (0, 0), (-1, -1), 0.2, C_BORDER),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        elements.append(t_cap)
        elements.append(Paragraph(
            "CAPEX-диапазоны — публичные данные открытых госзакупок РК + международные benchmarks. "
            "Для точного расчёта подключите SmetaExpert или ЛокСметный комплекс.",
            Small,
        ))

    # Recommendations
    if sim.get("recommendations"):
        elements.append(Paragraph("Что ещё нужно", H2))
        for r in sim["recommendations"][:5]:
            elements.append(Paragraph(
                f"• <b>{r['label']}</b>: +{r['still_needed']} объект"
                f"{'ов' if r['still_needed'] >= 5 else 'а'} "
                f"для 100% покрытия (сейчас {r['current_coverage_percent']:.1f}%).",
                Body,
            ))

    # Footer
    elements.append(Spacer(1, 16))
    footer_text = "Сгенерировано AQYL CITY · Не является окончательным бюджетом проекта."
    if author:
        footer_text += f" · Автор: {author}"
    elements.append(Paragraph(footer_text, Small))

    doc.build(elements)
    return buf.getvalue()
