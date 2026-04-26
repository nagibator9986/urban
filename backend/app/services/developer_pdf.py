"""PDF-экспорт Developer Pre-check отчёта — монетизационный документ.
Застройщик получает готовый к подаче в банк/акимат отчёт на 3-4 страницы.
"""

from __future__ import annotations

import io
import re
from datetime import datetime
from pathlib import Path

from reportlab.lib.colors import HexColor, Color
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import (
    BaseDocTemplate, Frame, Image, KeepTogether, NextPageTemplate,
    PageBreak, PageTemplate, Paragraph, Spacer, Table, TableStyle,
)

from app.services.business_plan_pdf import _register_fonts_once, _draw_cover, _draw_body

ROOT = Path(__file__).resolve().parent.parent.parent.parent
LOGO = ROOT / "frontend" / "public" / "aqyl-logo.png"

C_MINT = HexColor("#2DD4BF")
C_CYAN = HexColor("#22D3EE")
C_TEXT = HexColor("#1B2432")
C_MUTED = HexColor("#64748B")
C_BORDER = HexColor("#E2E8F0")
C_CREAM = HexColor("#F5F7FA")
C_SUCCESS = HexColor("#10B981")
C_WARNING = HexColor("#F59E0B")
C_DANGER = HexColor("#EF4444")


def _styles():
    return {
        "H1": ParagraphStyle("H1", fontName="UI-Bold", fontSize=20, leading=25,
                             textColor=C_TEXT, spaceAfter=8, spaceBefore=6),
        "H2": ParagraphStyle("H2", fontName="UI-Bold", fontSize=14, leading=18,
                             textColor=C_MINT, spaceAfter=6, spaceBefore=12),
        "H3": ParagraphStyle("H3", fontName="UI-Bold", fontSize=11, leading=15,
                             textColor=C_TEXT, spaceAfter=3, spaceBefore=6),
        "Body": ParagraphStyle("Body", fontName="UI", fontSize=10, leading=15,
                               textColor=C_TEXT, alignment=TA_JUSTIFY, spaceAfter=4),
        "Small": ParagraphStyle("Small", fontName="UI", fontSize=9, leading=12,
                                 textColor=C_MUTED, spaceAfter=3),
        "CK": ParagraphStyle("CK", fontName="UI-Bold", fontSize=10, leading=13,
                              textColor=C_MINT, alignment=TA_CENTER, spaceAfter=6),
        "CT": ParagraphStyle("CT", fontName="UI-Bold", fontSize=30, leading=34,
                              textColor=HexColor("#FFFFFF"), alignment=TA_CENTER),
        "CS": ParagraphStyle("CS", fontName="UI", fontSize=12, leading=18,
                              textColor=HexColor("#CBD5E1"), alignment=TA_CENTER, spaceAfter=24),
        "M":  ParagraphStyle("M", fontName="UI", fontSize=9, leading=13,
                              textColor=HexColor("#94A3B8"), alignment=TA_CENTER),
    }


def _risk_color(risk: str) -> Color:
    return {"low": C_SUCCESS, "medium": C_WARNING, "high": C_DANGER}.get(risk, C_MUTED)


def render_developer_pdf(report: dict) -> bytes:
    """Конвертирует Developer Pre-check в PDF."""
    _register_fonts_once()
    buf = io.BytesIO()
    doc = BaseDocTemplate(
        buf, pagesize=A4,
        leftMargin=2 * cm, rightMargin=2 * cm,
        topMargin=2.2 * cm, bottomMargin=2.2 * cm,
        title=f"AQYL Developer Pre-check · {report['district']}",
        author="AQYL CITY",
        subject="Оценка нагрузки нового ЖК на инфраструктуру",
    )
    cover = Frame(0, 0, A4[0], A4[1], leftPadding=0, rightPadding=0,
                  topPadding=0, bottomPadding=0, id="cover")
    body = Frame(2*cm, 2.2*cm, A4[0]-4*cm, A4[1]-4.4*cm, id="body")
    doc.addPageTemplates([
        PageTemplate(id="Cover", frames=[cover], onPage=_draw_cover),
        PageTemplate(id="Body",  frames=[body],  onPage=_draw_body),
    ])

    s = _styles()
    story = []

    # Cover
    story.append(Spacer(1, 4.5 * cm))
    if LOGO.exists():
        img = Image(str(LOGO), width=3.3 * cm, height=3.3 * cm)
        img.hAlign = "CENTER"
        story.append(img)
        story.append(Spacer(1, 0.5 * cm))

    story.append(Paragraph("DEVELOPER PRE-CHECK · AQYL CITY", s["CK"]))
    story.append(Paragraph("Оценка нагрузки ЖК", s["CT"]))
    story.append(Spacer(1, 0.3 * cm))
    story.append(Paragraph(
        f"<b>Район:</b> {report['district']}<br/>"
        f"<b>Квартир:</b> {report['apartments']:,}  ·  "
        f"<b>Класс:</b> {report['class_type']}".replace(",", " "),
        s["CS"]))

    story.append(Spacer(1, 2 * cm))
    story.append(Paragraph(
        f"Сгенерировано {datetime.utcnow():%d.%m.%Y %H:%M UTC}<br/>"
        "Материал для банка-кредитора и акимата<br/>"
        "Конфиденциально · внутреннее использование",
        s["M"]))

    story.append(NextPageTemplate("Body"))
    story.append(PageBreak())

    # --- Summary stats ---
    ru = lambda n: f"{int(n):,}".replace(",", " ")

    def big_cell(num, label, color):
        num_s = ParagraphStyle("n", fontName="UI-Bold", fontSize=20, leading=24,
                               textColor=color, alignment=TA_CENTER)
        lab_s = ParagraphStyle("l", fontName="UI", fontSize=8, leading=10,
                               textColor=C_MUTED, alignment=TA_CENTER)
        return Table([[Paragraph(num, num_s)], [Paragraph(label, lab_s)]],
                     colWidths=[3.85 * cm], rowHeights=[0.95 * cm, 0.55 * cm],
                     style=TableStyle([
                         ("BOX", (0,0), (-1,-1), 0.5, C_BORDER),
                         ("BACKGROUND", (0,0), (-1,-1), C_CREAM),
                         ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
                     ]))

    imp = report["score_impact"]
    risk = report["risk"]
    story.append(Table([[
        big_cell(ru(report["new_residents"]), "НОВЫХ ЖИТЕЛЕЙ", C_MINT),
        big_cell(ru(report["demographics"]["kids_0_6"]), "ДЕТЕЙ 0-6", C_CYAN),
        big_cell(ru(report["demographics"]["kids_6_18"]), "ДЕТЕЙ 6-18", HexColor("#A855F7")),
        big_cell(f"{imp['delta_with_mitigation']:+.1f}", "Δ ОЦЕНКА",
                 _risk_color(risk["level"])),
    ]], colWidths=[4 * cm] * 4))
    story.append(Spacer(1, 0.5 * cm))

    # --- Risk block ---
    risk_color = _risk_color(risk["level"])
    story.append(Table(
        [[Paragraph(
            f"<font color='white'><b>УРОВЕНЬ РИСКА: {risk['level'].upper()}</b></font><br/><br/>"
            f"<font color='white'>{risk['label']}</font>",
            ParagraphStyle("r", fontName="UI", fontSize=11, leading=16,
                           textColor=HexColor("#FFFFFF")),
        )]],
        colWidths=[17 * cm],
        style=TableStyle([
            ("BACKGROUND", (0,0), (-1,-1), risk_color),
            ("LEFTPADDING", (0,0), (-1,-1), 16),
            ("RIGHTPADDING", (0,0), (-1,-1), 16),
            ("TOPPADDING", (0,0), (-1,-1), 14),
            ("BOTTOMPADDING", (0,0), (-1,-1), 14),
        ]),
    ))
    story.append(Spacer(1, 0.6 * cm))

    # --- Score Impact ---
    story.append(Paragraph("1. Влияние на оценку района", s["H2"]))
    score_rows = [
        ["Метрика", "Значение"],
        ["Оценка района ДО нового ЖК", f"{imp['before']}/100"],
        ["Оценка района ПОСЛЕ (без компенсаций)",
         f"{imp['after_no_mitigation']}/100  ({imp['delta_no_mitigation']:+.1f})"],
        ["Оценка района ПОСЛЕ (с компенсациями)",
         f"{imp['after_with_mitigation']}/100  ({imp['delta_with_mitigation']:+.1f})"],
    ]
    t = Table(score_rows, colWidths=[10 * cm, 7 * cm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), C_MINT),
        ("TEXTCOLOR", (0,0), (-1,0), HexColor("#052029")),
        ("FONTNAME", (0,0), (-1,0), "UI-Bold"),
        ("FONTNAME", (0,1), (-1,-1), "UI"),
        ("FONTSIZE", (0,0), (-1,-1), 10),
        ("GRID", (0,0), (-1,-1), 0.3, C_BORDER),
        ("LEFTPADDING", (0,0), (-1,-1), 10),
        ("RIGHTPADDING", (0,0), (-1,-1), 10),
        ("TOPPADDING", (0,0), (-1,-1), 7),
        ("BOTTOMPADDING", (0,0), (-1,-1), 7),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [HexColor("#FFFFFF"), C_CREAM]),
    ]))
    story.append(t)
    story.append(Spacer(1, 0.5 * cm))

    # --- Infrastructure requirements ---
    story.append(Paragraph("2. Дополнительная потребность в инфраструктуре", s["H2"]))
    req_rows = [["Тип", "Нужно доп.", "Мощность", "Тип. стоимость"]]
    for r in report["requirements"]:
        need = r["extra_facilities_rounded"]
        req_rows.append([
            r["label"],
            f"{need} объект{'а' if 1<need<5 else 'ов' if need>=5 else ''}"
              if need > 0 else "в норме",
            f"{r['extra_capacity_needed']:,} {r['capacity_unit']}".replace(",", " ") if r['capacity_unit'] else "—",
            r["typical_cost_usd"],
        ])
    t = Table(req_rows, colWidths=[5*cm, 4*cm, 4.5*cm, 3.5*cm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), C_MINT),
        ("TEXTCOLOR", (0,0), (-1,0), HexColor("#052029")),
        ("FONTNAME", (0,0), (-1,0), "UI-Bold"),
        ("FONTNAME", (0,1), (-1,-1), "UI"),
        ("FONTSIZE", (0,0), (-1,-1), 9),
        ("GRID", (0,0), (-1,-1), 0.3, C_BORDER),
        ("LEFTPADDING", (0,0), (-1,-1), 8),
        ("RIGHTPADDING", (0,0), (-1,-1), 8),
        ("TOPPADDING", (0,0), (-1,-1), 6),
        ("BOTTOMPADDING", (0,0), (-1,-1), 6),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [HexColor("#FFFFFF"), C_CREAM]),
    ]))
    story.append(t)
    story.append(Spacer(1, 0.5 * cm))

    # --- Compensations ---
    if report["mitigations"]:
        story.append(Paragraph("3. Компенсационные меры застройщика", s["H2"]))
        for m in report["mitigations"]:
            story.append(Paragraph(f"✓ Встроен{'а' if m['type'] == 'school' else ''}: <b>{m['type']}</b> ({m['count']} ед.)", s["Body"]))
        story.append(Spacer(1, 0.3 * cm))

    # --- Recommendations ---
    story.append(Paragraph("4. Рекомендации AQYL AI", s["H2"]))
    for rec in report["recommendations"]:
        story.append(Paragraph(f"• {rec}", s["Body"]))
    story.append(Spacer(1, 0.5 * cm))

    # --- Footer note ---
    story.append(Paragraph(
        "<i>Отчёт сгенерирован платформой AQYL CITY на основе публичных данных "
        "(OpenStreetMap, stat.gov.kz) и норм СНиП РК 3.01-01-2008. "
        "Рекомендуется верифицировать с локальным отделом архитектуры акимата. "
        "Не является официальным документом, но может быть приложен к "
        "проектной декларации как аналитический материал.</i>",
        s["Small"]))

    doc.build(story)
    return buf.getvalue()
