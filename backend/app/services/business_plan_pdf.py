"""PDF-экспорт бизнес-плана — конвертирует Markdown в презентабельный PDF
под подачу в банк/инвестору. Использует reportlab + Arial (кириллица).
"""

from __future__ import annotations

import io
import re
from datetime import datetime
from pathlib import Path

from reportlab.lib.colors import HexColor, Color
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily
from reportlab.platypus import (
    BaseDocTemplate, Frame, Image, KeepTogether, PageBreak,
    PageTemplate, Paragraph, Spacer, Table, TableStyle,
)

ROOT = Path(__file__).resolve().parent.parent.parent.parent
LOGO = ROOT / "frontend" / "public" / "aqyl-logo.png"

C_MINT = HexColor("#2DD4BF")
C_CYAN = HexColor("#22D3EE")
C_TEXT = HexColor("#1B2432")
C_MUTED = HexColor("#64748B")
C_BORDER = HexColor("#E2E8F0")
C_CREAM = HexColor("#F5F7FA")
C_BG = HexColor("#0A0F1A")
C_SUCCESS = HexColor("#10B981")
C_DANGER = HexColor("#EF4444")

FONT_DIRS = [
    Path("/System/Library/Fonts/Supplemental"),
    Path("/Library/Fonts"),
    Path("/System/Library/Fonts"),
]
_FONTS_REGISTERED = False


def _find_font(names: list[str]) -> Path | None:
    for d in FONT_DIRS:
        for n in names:
            p = d / n
            if p.exists():
                return p
    return None


def _register_fonts_once():
    global _FONTS_REGISTERED
    if _FONTS_REGISTERED:
        return
    reg = _find_font(["Arial.ttf", "Arial Unicode.ttf"])
    if not reg:
        raise RuntimeError("Cannot find Arial.ttf for PDF generation")
    bold = _find_font(["Arial Bold.ttf", "Arial Unicode.ttf"]) or reg
    ital = _find_font(["Arial Italic.ttf", "Arial.ttf"]) or reg
    bi = _find_font(["Arial Bold Italic.ttf", "Arial Bold.ttf"]) or reg

    pdfmetrics.registerFont(TTFont("UI", str(reg)))
    pdfmetrics.registerFont(TTFont("UI-Bold", str(bold)))
    pdfmetrics.registerFont(TTFont("UI-Ital", str(ital)))
    pdfmetrics.registerFont(TTFont("UI-BI", str(bi)))
    registerFontFamily("UI", normal="UI", bold="UI-Bold", italic="UI-Ital", boldItalic="UI-BI")
    _FONTS_REGISTERED = True


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
        "Bullet": ParagraphStyle("Bullet", fontName="UI", fontSize=10, leading=14,
                                 textColor=C_TEXT, leftIndent=14, spaceAfter=2),
        "Cover-Kicker": ParagraphStyle("CK", fontName="UI-Bold", fontSize=10, leading=13,
                                        textColor=C_MINT, alignment=TA_CENTER, spaceAfter=6),
        "Cover-Title": ParagraphStyle("CT", fontName="UI-Bold", fontSize=32, leading=36,
                                       textColor=HexColor("#FFFFFF"), alignment=TA_CENTER),
        "Cover-Sub": ParagraphStyle("CS", fontName="UI", fontSize=13, leading=18,
                                     textColor=HexColor("#CBD5E1"), alignment=TA_CENTER, spaceAfter=24),
        "Meta": ParagraphStyle("M", fontName="UI", fontSize=9, leading=13,
                                textColor=HexColor("#94A3B8"), alignment=TA_CENTER),
        "StatNum": ParagraphStyle("SN", fontName="UI-Bold", fontSize=22, leading=26,
                                   textColor=C_MINT, alignment=TA_CENTER),
        "StatLabel": ParagraphStyle("SL", fontName="UI", fontSize=8, leading=10,
                                     textColor=C_MUTED, alignment=TA_CENTER),
    }


def _draw_cover(canvas, doc):
    canvas.saveState()
    w, h = A4
    canvas.setFillColor(C_BG)
    canvas.rect(0, 0, w, h, fill=1, stroke=0)
    canvas.setFillColor(C_MINT)
    canvas.rect(0, h - 6, w, 6, fill=1, stroke=0)
    canvas.setFillColor(C_CYAN)
    canvas.rect(0, 0, w, 6, fill=1, stroke=0)
    canvas.setFillColor(C_MINT)
    canvas.setFillAlpha(0.08)
    canvas.circle(w * 0.85, h * 0.75, 130, fill=1, stroke=0)
    canvas.setFillColor(C_CYAN)
    canvas.setFillAlpha(0.06)
    canvas.circle(w * 0.15, h * 0.25, 170, fill=1, stroke=0)
    canvas.setFillAlpha(1.0)
    canvas.restoreState()


def _draw_body(canvas, doc):
    canvas.saveState()
    w, h = A4
    canvas.setFillColor(C_MINT)
    canvas.rect(0, h - 3, w, 3, fill=1, stroke=0)
    canvas.setFont("UI-Bold", 8)
    canvas.setFillColor(C_MUTED)
    canvas.drawString(2 * cm, h - 1.5 * cm, "AQYL CITY · AI Business Plan · Almaty")
    if LOGO.exists():
        try:
            canvas.drawImage(str(LOGO), w - 2.3 * cm, h - 2.0 * cm,
                             width=0.9 * cm, height=0.9 * cm, mask="auto")
        except Exception:
            pass
    canvas.setFillColor(C_BORDER)
    canvas.rect(2 * cm, 1.8 * cm, w - 4 * cm, 0.5, fill=1, stroke=0)
    canvas.setFont("UI", 8)
    canvas.setFillColor(C_MUTED)
    canvas.drawString(2 * cm, 1.3 * cm,
                      "Сгенерировано AQYL AI · не является офертой, готовится для внутреннего анализа")
    canvas.drawRightString(w - 2 * cm, 1.3 * cm, f"{doc.page}")
    canvas.restoreState()


def _md_to_story(md: str, styles: dict) -> list:
    """Простой конвертер Markdown в список Platypus flowables."""
    story = []
    lines = md.splitlines()
    i = 0
    in_list = False
    list_items: list[str] = []

    def flush_list():
        nonlocal in_list, list_items
        if list_items:
            for li in list_items:
                story.append(Paragraph(f"• {_inline(li)}", styles["Bullet"]))
            list_items = []
        in_list = False

    while i < len(lines):
        raw = lines[i]
        line = raw.rstrip()

        if not line.strip():
            flush_list()
            story.append(Spacer(1, 4))
            i += 1
            continue

        h = re.match(r"^(#{1,3})\s+(.+)$", line)
        if h:
            flush_list()
            level = len(h.group(1))
            text = h.group(2)
            style_key = {1: "H1", 2: "H2", 3: "H3"}[level]
            story.append(Paragraph(_inline(text), styles[style_key]))
            i += 1
            continue

        if re.match(r"^\s*[-*]\s+", line):
            in_list = True
            list_items.append(re.sub(r"^\s*[-*]\s+", "", line))
            i += 1
            continue

        if re.match(r"^\s*\d+\.\s+", line):
            in_list = True
            list_items.append(re.sub(r"^\s*\d+\.\s+", "", line))
            i += 1
            continue

        if line.startswith("_") and line.endswith("_"):
            flush_list()
            story.append(Paragraph(f"<i>{_inline(line.strip('_'))}</i>", styles["Body"]))
            i += 1
            continue

        flush_list()
        story.append(Paragraph(_inline(line), styles["Body"]))
        i += 1

    flush_list()
    return story


def _inline(s: str) -> str:
    s = s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    s = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", s)
    s = re.sub(r"`([^`]+)`", r'<font name="UI-Bold">\1</font>', s)
    s = re.sub(r"\*([^*]+)\*", r"<i>\1</i>", s)
    return s


def _finance_table(finance: dict, styles) -> Table:
    def ru(n):
        return f"${int(n):,}".replace(",", " ")

    rows = [
        ["Показатель", "Значение"],
        ["Инвестиции (CAPEX)", ru(finance["capex_usd"])],
        ["Операционные расходы / мес", ru(finance["opex_monthly_usd"])],
        ["Выручка мес. (первый год)", ru(finance["revenue_m1_12_usd"])],
        ["Выручка мес. (второй год)", ru(finance["revenue_m13_24_usd"])],
        ["Чистая прибыль · год 1", ru(finance["net_year_1_usd"])],
        ["Точка безубыточности", f"{finance['break_even_months']} мес"],
        ["Чистая маржа", f"{int(finance['margin_net'] * 100)}%"],
        ["Аренда / м²", ru(finance["rent_per_m2_usd"]) + " /м²"],
    ]
    t = Table(rows, colWidths=[8 * cm, 5 * cm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), C_MINT),
        ("TEXTCOLOR", (0, 0), (-1, 0), HexColor("#052029")),
        ("FONTNAME", (0, 0), (-1, 0), "UI-Bold"),
        ("FONTNAME", (0, 1), (-1, -1), "UI"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("GRID", (0, 0), (-1, -1), 0.3, C_BORDER),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [HexColor("#FFFFFF"), C_CREAM]),
    ]))
    return t


def render_plan_pdf(plan: dict) -> bytes:
    """Конвертируем результат generate_plan(...) в байты PDF."""
    _register_fonts_once()

    buf = io.BytesIO()
    doc = BaseDocTemplate(
        buf, pagesize=A4,
        leftMargin=2 * cm, rightMargin=2 * cm,
        topMargin=2.2 * cm, bottomMargin=2.2 * cm,
        title=f"AQYL Business Plan · {plan['summary'].get('category_label', '')}",
        author="AQYL CITY", subject="AI-сгенерированный бизнес-план",
    )

    cover_frame = Frame(0, 0, A4[0], A4[1], leftPadding=0, rightPadding=0,
                        topPadding=0, bottomPadding=0, id="cover")
    body_frame = Frame(2 * cm, 2.2 * cm, A4[0] - 4 * cm, A4[1] - 4.4 * cm, id="body")

    doc.addPageTemplates([
        PageTemplate(id="Cover", frames=[cover_frame], onPage=_draw_cover),
        PageTemplate(id="Body", frames=[body_frame], onPage=_draw_body),
    ])

    styles = _styles()
    summary = plan["summary"]
    label = summary.get("category_label", "Бизнес-план")
    district = summary.get("district", "Алматы")

    story = []

    # Cover
    story.append(Spacer(1, 4.5 * cm))
    if LOGO.exists():
        img = Image(str(LOGO), width=3.5 * cm, height=3.5 * cm)
        img.hAlign = "CENTER"
        story.append(img)
        story.append(Spacer(1, 0.6 * cm))

    story.append(Paragraph("AI-BUSINESS PLAN · AQYL CITY", styles["Cover-Kicker"]))
    story.append(Paragraph(label, styles["Cover-Title"]))
    story.append(Spacer(1, 0.4 * cm))
    story.append(Paragraph(
        f"<b>Локация:</b> {district}<br/>"
        f"<b>Бюджет:</b> ${int(plan.get('finance', {}).get('capex_usd', 0)):,}".replace(",", " "),
        styles["Cover-Sub"]))

    story.append(Spacer(1, 2 * cm))
    story.append(Paragraph(
        f"Сгенерировано {datetime.utcnow():%d.%m.%Y %H:%M UTC}<br/>"
        f"Движок: {plan.get('engine', 'aqyl-ai')}<br/>"
        "Конфиденциально · только для внутреннего анализа",
        styles["Meta"]))

    from reportlab.platypus import NextPageTemplate
    story.append(NextPageTemplate("Body"))
    story.append(PageBreak())

    # Summary stats row
    stat_cells = [
        [Paragraph(f"${summary.get('capex_usd', 0):,}".replace(",", " "), styles["StatNum"])],
        [Paragraph("ИНВЕСТИЦИИ", styles["StatLabel"])],
    ]

    def stat_cell(num: str, label_: str, color: Color):
        num_style = ParagraphStyle("n", parent=styles["StatNum"], textColor=color)
        return Table([[Paragraph(num, num_style)], [Paragraph(label_, styles["StatLabel"])]],
                     colWidths=[3.9 * cm], rowHeights=[0.9 * cm, 0.6 * cm],
                     style=TableStyle([
                         ("BOX", (0, 0), (-1, -1), 0.5, C_BORDER),
                         ("BACKGROUND", (0, 0), (-1, -1), C_CREAM),
                         ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                     ]))

    ru = lambda n: f"${int(n):,}".replace(",", " ")
    finance = plan.get("finance", {})
    row = Table([[
        stat_cell(ru(finance.get("capex_usd", 0)), "CAPEX", C_MINT),
        stat_cell(ru(finance.get("opex_monthly_usd", 0)), "OPEX/МЕС", C_CYAN),
        stat_cell(f"{finance.get('break_even_months', '?')} мес", "BEP", HexColor("#A855F7")),
        stat_cell(ru(finance.get("net_year_1_usd", 0)), "ЧИСТ. ГОД 1",
                  C_SUCCESS if finance.get("net_year_1_usd", 0) > 0 else C_DANGER),
    ]], colWidths=[4 * cm] * 4)
    story.append(row)
    story.append(Spacer(1, 0.5 * cm))

    # Markdown body
    story.extend(_md_to_story(plan["markdown"], styles))

    story.append(Spacer(1, 0.8 * cm))
    story.append(Paragraph("Финансовая модель (детали)", styles["H2"]))
    story.append(_finance_table(finance, styles))

    story.append(Spacer(1, 0.8 * cm))
    story.append(Paragraph(
        "<i>Этот документ сгенерирован AQYL AI на основе данных OpenStreetMap, "
        "stat.gov.kz, baseline-модели рынка Алматы. Цифры — оценочные, проверяйте "
        "на этапе финансовой модели перед подачей в банк.</i>",
        styles["Body"]))

    doc.build(story)
    return buf.getvalue()
