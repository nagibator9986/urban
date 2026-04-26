"""Генератор презентационного PDF для AQYL CITY.

Собирает подробный документ: обложка → содержание → миссия →
три режима → AI → технологии → источники данных → сценарии → roadmap.
Требует только reportlab. Кириллица через Arial TTF (macOS).

Запуск:
    python3 scripts/generate_pdf.py
Выход: docs/AQYL_CITY_Overview.pdf
"""

from __future__ import annotations

import datetime as dt
from pathlib import Path

from reportlab.lib.colors import HexColor, Color
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm, mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate, Frame, Image, KeepTogether, PageBreak,
    PageTemplate, Paragraph, Spacer, Table, TableStyle,
)

ROOT = Path(__file__).resolve().parent.parent
LOGO = ROOT / "frontend" / "public" / "aqyl-logo.png"
OUT_DIR = ROOT / "docs"
OUT_DIR.mkdir(exist_ok=True)
OUT_PDF = OUT_DIR / "AQYL_CITY_Overview.pdf"

# -------- Шрифты (macOS) --------
FONT_DIRS = [
    Path("/System/Library/Fonts/Supplemental"),
    Path("/Library/Fonts"),
    Path("/System/Library/Fonts"),
]


def _find_font(names: list[str]) -> Path | None:
    for d in FONT_DIRS:
        for n in names:
            p = d / n
            if p.exists():
                return p
    return None


def _register_fonts():
    """Регистрируем Arial с кириллицей (macOS имеет Arial из коробки)."""
    reg   = _find_font(["Arial.ttf", "Arial Unicode.ttf"])
    bold  = _find_font(["Arial Bold.ttf", "Arial Unicode.ttf"])
    ital  = _find_font(["Arial Italic.ttf", "Arial.ttf"])
    boldi = _find_font(["Arial Bold Italic.ttf", "Arial Bold.ttf"])
    mono  = _find_font(["Monaco.ttf", "Courier New.ttf", "Arial.ttf"])

    if not reg:
        raise RuntimeError("Не найден Arial.ttf в системных шрифтах")

    pdfmetrics.registerFont(TTFont("UI",      str(reg)))
    pdfmetrics.registerFont(TTFont("UI-Bold", str(bold or reg)))
    pdfmetrics.registerFont(TTFont("UI-Ital", str(ital or reg)))
    pdfmetrics.registerFont(TTFont("UI-BI",   str(boldi or bold or reg)))
    pdfmetrics.registerFont(TTFont("UI-Mono", str(mono or reg)))

    from reportlab.pdfbase.pdfmetrics import registerFontFamily
    registerFontFamily("UI", normal="UI", bold="UI-Bold",
                       italic="UI-Ital", boldItalic="UI-BI")


# -------- Цвета бренда --------
C_BG       = HexColor("#0A0F1A")
C_DARK     = HexColor("#111827")
C_SURFACE  = HexColor("#18212F")
C_MINT     = HexColor("#2DD4BF")
C_CYAN     = HexColor("#22D3EE")
C_TEXT     = HexColor("#1B2432")
C_MUTED    = HexColor("#64748B")
C_BORDER   = HexColor("#E2E8F0")
C_BORDER_D = HexColor("#334155")
C_SUCCESS  = HexColor("#10B981")
C_WARNING  = HexColor("#F59E0B")
C_DANGER   = HexColor("#EF4444")
C_PURPLE   = HexColor("#A855F7")
C_CREAM    = HexColor("#F5F7FA")


# -------- Стили параграфов --------
def build_styles():
    s = getSampleStyleSheet()
    styles: dict[str, ParagraphStyle] = {}

    styles["H1"] = ParagraphStyle(
        "H1", parent=s["Normal"], fontName="UI-Bold", fontSize=22,
        leading=28, textColor=C_TEXT, spaceAfter=12, spaceBefore=6,
    )
    styles["H2"] = ParagraphStyle(
        "H2", parent=s["Normal"], fontName="UI-Bold", fontSize=15,
        leading=20, textColor=C_MINT, spaceAfter=8, spaceBefore=14,
    )
    styles["H3"] = ParagraphStyle(
        "H3", parent=s["Normal"], fontName="UI-Bold", fontSize=12,
        leading=16, textColor=C_TEXT, spaceAfter=4, spaceBefore=8,
    )
    styles["Body"] = ParagraphStyle(
        "Body", parent=s["Normal"], fontName="UI", fontSize=10,
        leading=15, textColor=C_TEXT, alignment=TA_JUSTIFY, spaceAfter=5,
    )
    styles["Bullet"] = ParagraphStyle(
        "Bullet", parent=styles["Body"], leftIndent=14, bulletIndent=0,
        spaceAfter=2, alignment=TA_LEFT,
    )
    styles["Muted"] = ParagraphStyle(
        "Muted", parent=styles["Body"], textColor=C_MUTED, fontSize=9,
    )
    styles["Mono"] = ParagraphStyle(
        "Mono", parent=s["Normal"], fontName="UI-Mono", fontSize=8.5,
        leading=12, textColor=C_TEXT, backColor=C_CREAM,
        leftIndent=8, rightIndent=8, spaceBefore=4, spaceAfter=8,
        borderColor=C_BORDER, borderWidth=0.5, borderPadding=6,
    )
    styles["Cover-Kicker"] = ParagraphStyle(
        "Cover-Kicker", fontName="UI-Bold", fontSize=11, leading=14,
        textColor=C_MINT, alignment=TA_CENTER, spaceAfter=6,
    )
    styles["Cover-Title"] = ParagraphStyle(
        "Cover-Title", fontName="UI-Bold", fontSize=54, leading=58,
        textColor=HexColor("#FFFFFF"), alignment=TA_CENTER, spaceAfter=8,
    )
    styles["Cover-Sub"] = ParagraphStyle(
        "Cover-Sub", fontName="UI", fontSize=14, leading=20,
        textColor=HexColor("#CBD5E1"), alignment=TA_CENTER, spaceAfter=24,
    )
    styles["Cover-Meta"] = ParagraphStyle(
        "Cover-Meta", fontName="UI", fontSize=10, leading=15,
        textColor=HexColor("#94A3B8"), alignment=TA_CENTER,
    )
    styles["Tag"] = ParagraphStyle(
        "Tag", fontName="UI-Bold", fontSize=9, textColor=HexColor("#FFFFFF"),
        alignment=TA_CENTER, leading=12,
    )
    styles["Stat-Num"] = ParagraphStyle(
        "Stat-Num", fontName="UI-Bold", fontSize=28, leading=32,
        textColor=C_MINT, alignment=TA_CENTER,
    )
    styles["Stat-Label"] = ParagraphStyle(
        "Stat-Label", fontName="UI", fontSize=8.5, leading=11,
        textColor=C_MUTED, alignment=TA_CENTER,
    )
    return styles


# -------- Обложка и фоновые рисовалки --------
def draw_cover_background(canvas, doc):
    canvas.saveState()
    w, h = A4
    # Сплошной тёмный фон
    canvas.setFillColor(C_BG)
    canvas.rect(0, 0, w, h, fill=1, stroke=0)

    # Горизонтальная «лента» с градиент-имитацией через полосы
    bands = 240
    for i in range(bands):
        t = i / bands
        r = 0.176 + t * (0.133 - 0.176)  # 0x2D→0x22 (mint→cyan approx)
        g = 0.831 + t * (0.827 - 0.831)
        b = 0.749 + t * (0.933 - 0.749)
        canvas.setFillColorRGB(r, g, b, alpha=0.08)
        canvas.rect(0, h * 0.54 + (i - bands / 2) * 0.3, w, 0.6, fill=1, stroke=0)

    # Акцентная mint полоска сверху
    canvas.setFillColor(C_MINT)
    canvas.rect(0, h - 8, w, 8, fill=1, stroke=0)

    # Акцентная cyan полоска снизу
    canvas.setFillColor(C_CYAN)
    canvas.rect(0, 0, w, 8, fill=1, stroke=0)

    # Крупные декоративные круги
    canvas.setFillColor(C_MINT)
    canvas.setFillAlpha(0.08)
    canvas.circle(w * 0.85, h * 0.75, 140, fill=1, stroke=0)
    canvas.setFillColor(C_CYAN)
    canvas.setFillAlpha(0.06)
    canvas.circle(w * 0.15, h * 0.25, 180, fill=1, stroke=0)
    canvas.setFillAlpha(1.0)

    canvas.restoreState()


def draw_page_decorations(canvas, doc):
    """Header/footer для внутренних страниц."""
    canvas.saveState()
    w, h = A4

    # Полоска в шапке
    canvas.setFillColor(C_MINT)
    canvas.rect(0, h - 3, w, 3, fill=1, stroke=0)

    # Текст шапки
    canvas.setFont("UI-Bold", 8)
    canvas.setFillColor(C_MUTED)
    canvas.drawString(2 * cm, h - 1.5 * cm, "AQYL CITY · Smart City Intelligence · Almaty")

    # Лого мини в правом верхнем
    if LOGO.exists():
        try:
            canvas.drawImage(
                str(LOGO), w - 2.3 * cm, h - 2.0 * cm,
                width=0.9 * cm, height=0.9 * cm, mask="auto",
            )
        except Exception:
            pass

    # Футер
    canvas.setFillColor(C_BORDER)
    canvas.rect(2 * cm, 1.8 * cm, w - 4 * cm, 0.5, fill=1, stroke=0)
    canvas.setFont("UI", 8)
    canvas.setFillColor(C_MUTED)
    canvas.drawString(2 * cm, 1.3 * cm, "v1.0 · 2026 · AQYL (каз. «разум») · Enactus project")
    canvas.drawRightString(w - 2 * cm, 1.3 * cm, f"Страница {doc.page}")

    canvas.restoreState()


# -------- Вспомогательные блоки --------
def hr(height=0.8, color=C_BORDER):
    """Горизонтальная линия через Table."""
    t = Table([[""]], colWidths=[17 * cm], rowHeights=[height])
    t.setStyle(TableStyle([
        ("LINEBELOW", (0, 0), (-1, -1), height, color),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    return t


def stat_card(number: str, label: str, color: Color, styles):
    """Карточка с крупной цифрой и подписью."""
    num_style = ParagraphStyle("n", parent=styles["Stat-Num"], textColor=color)
    return Table(
        [[Paragraph(number, num_style)], [Paragraph(label, styles["Stat-Label"])]],
        colWidths=[4.0 * cm],
        rowHeights=[1.1 * cm, 0.75 * cm],
        style=TableStyle([
            ("BOX", (0, 0), (-1, -1), 0.5, C_BORDER),
            ("BACKGROUND", (0, 0), (-1, -1), C_CREAM),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ("TOPPADDING", (0, 0), (0, 0), 8),
            ("BOTTOMPADDING", (0, 0), (0, 0), 2),
            ("TOPPADDING", (0, 1), (0, 1), 0),
            ("BOTTOMPADDING", (0, 1), (0, 1), 8),
        ]),
    )


def stat_row(items, styles):
    """Горизонтальный ряд из stat-карточек."""
    cells = [stat_card(n, l, c, styles) for (n, l, c) in items]
    return Table([cells], colWidths=[4.25 * cm] * len(cells),
                 style=TableStyle([
                     ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                     ("LEFTPADDING", (0, 0), (-1, -1), 2),
                     ("RIGHTPADDING", (0, 0), (-1, -1), 2),
                 ]))


def feature_card(title: str, body: str, accent: Color, styles):
    """Карточка фичи: заголовок в цветной плашке + описание."""
    head = Table(
        [[Paragraph(f"<font color='white'><b>{title}</b></font>", styles["Tag"])]],
        colWidths=[17 * cm], rowHeights=[0.7 * cm],
        style=TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), accent),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (-1, -1), 14),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]),
    )
    body_p = Table(
        [[Paragraph(body, styles["Body"])]],
        colWidths=[17 * cm],
        style=TableStyle([
            ("BOX", (0, 0), (-1, -1), 0.5, C_BORDER),
            ("BACKGROUND", (0, 0), (-1, -1), HexColor("#FAFBFC")),
            ("LEFTPADDING", (0, 0), (-1, -1), 14),
            ("RIGHTPADDING", (0, 0), (-1, -1), 14),
            ("TOPPADDING", (0, 0), (-1, -1), 10),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ]),
    )
    return KeepTogether([head, body_p, Spacer(1, 10)])


def mode_box(title: str, who: str, problems: list[str], capabilities: list[str],
             accent: Color, styles):
    """Большой блок под один из 3 режимов."""
    head = Table(
        [[Paragraph(f"<font color='white'><b>{title}</b></font>", styles["Tag"])]],
        colWidths=[17 * cm], rowHeights=[0.9 * cm],
        style=TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), accent),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (-1, -1), 14),
        ]),
    )
    who_p = Paragraph(f"<b>Кому полезен:</b> {who}", styles["Body"])
    prob_p = [Paragraph(f"<b>Какие проблемы решает:</b>", styles["Body"])]
    prob_p += [Paragraph(f"• {p}", styles["Bullet"]) for p in problems]
    cap_p = [Paragraph(f"<b>Возможности:</b>", styles["Body"])]
    cap_p += [Paragraph(f"• {c}", styles["Bullet"]) for c in capabilities]

    body = Table(
        [[who_p], [Spacer(1, 4)], *[[p] for p in prob_p],
         [Spacer(1, 4)], *[[p] for p in cap_p]],
        colWidths=[17 * cm],
        style=TableStyle([
            ("BOX", (0, 0), (-1, -1), 0.5, C_BORDER),
            ("BACKGROUND", (0, 0), (-1, -1), HexColor("#FAFBFC")),
            ("LEFTPADDING", (0, 0), (-1, -1), 14),
            ("RIGHTPADDING", (0, 0), (-1, -1), 14),
            ("TOPPADDING", (0, 0), (-1, -1), 2),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ]),
    )
    return KeepTogether([head, body, Spacer(1, 14)])


def data_table(rows, col_widths, header=True, styles=None):
    """Аккуратная таблица с бренд-заголовком."""
    style_commands = [
        ("GRID", (0, 0), (-1, -1), 0.3, C_BORDER),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("FONTNAME", (0, 0), (-1, -1), "UI"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
    ]
    if header:
        style_commands += [
            ("BACKGROUND", (0, 0), (-1, 0), C_MINT),
            ("TEXTCOLOR", (0, 0), (-1, 0), HexColor("#052029")),
            ("FONTNAME", (0, 0), (-1, 0), "UI-Bold"),
            ("FONTSIZE", (0, 0), (-1, 0), 9),
        ]
    # Зебра
    for i in range(1, len(rows)):
        if i % 2 == 0:
            style_commands.append(("BACKGROUND", (0, i), (-1, i), C_CREAM))

    return Table(rows, colWidths=col_widths, style=TableStyle(style_commands))


# -------- Контент PDF --------
def build_story(styles):
    S = []

    # ---------- COVER ----------
    S.append(Spacer(1, 5 * cm))
    if LOGO.exists():
        img = Image(str(LOGO), width=4 * cm, height=4 * cm)
        img.hAlign = "CENTER"
        S.append(img)
        S.append(Spacer(1, 0.5 * cm))

    S.append(Paragraph("SMART CITY INTELLIGENCE", styles["Cover-Kicker"]))
    S.append(Paragraph("AQYL CITY", styles["Cover-Title"]))
    S.append(Paragraph(
        "Платформа городской аналитики нового поколения для Алматы.<br/>"
        "Общественная инфраструктура · Бизнес-ландшафт · Экология · AI-аналитика",
        styles["Cover-Sub"]))
    S.append(Spacer(1, 2 * cm))

    today = dt.date.today().strftime("%d.%m.%Y")
    S.append(Paragraph(
        f"Версия 1.0 · {today}<br/>"
        "Enactus Project · Almaty, Kazakhstan",
        styles["Cover-Meta"]))

    S.append(PageBreak())

    # ---------- CONTENTS ----------
    S.append(Paragraph("Содержание", styles["H1"]))
    S.append(hr())
    S.append(Spacer(1, 0.5 * cm))
    toc = [
        ("1.", "Зачем нужна платформа", "3"),
        ("2.", "Целевая аудитория и ценность", "4"),
        ("3.", "Ключевые возможности", "5"),
        ("4.", "Общественный режим", "6"),
        ("5.", "Бизнес-режим", "7"),
        ("6.", "Экологический режим", "8"),
        ("7.", "AQYL AI — помощник и отчёты", "9"),
        ("8.", "What-if симулятор градостроительных решений", "10"),
        ("9.", "Источники данных", "11"),
        ("10.", "Технологическая архитектура", "12"),
        ("11.", "Сценарии использования", "13"),
        ("12.", "Развитие и дорожная карта", "14"),
    ]
    toc_data = [[Paragraph(f"<b>{n}</b>", styles["Body"]),
                 Paragraph(t, styles["Body"]),
                 Paragraph(f"<font color='#64748B'>с. {p}</font>", styles["Body"])]
                for n, t, p in toc]
    S.append(Table(toc_data, colWidths=[1 * cm, 14 * cm, 2 * cm],
                   style=TableStyle([
                       ("LEFTPADDING", (0, 0), (-1, -1), 0),
                       ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                       ("TOPPADDING", (0, 0), (-1, -1), 4),
                       ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                       ("LINEBELOW", (0, 0), (-1, -1), 0.25, C_BORDER),
                   ])))

    S.append(PageBreak())

    # ---------- 1. Зачем ----------
    S.append(Paragraph("1. Зачем нужна платформа", styles["H1"]))
    S.append(hr())
    S.append(Spacer(1, 0.3 * cm))

    S.append(Paragraph(
        "Алматы — город с населением свыше <b>2,35 миллиона</b> человек, растущий на "
        "50-60 тысяч жителей в год. Такой темп опережает возможности ручного анализа: "
        "данные о школах лежат у ГОРО, о бизнесах — в 2GIS, о воздухе — у Казгидромета "
        "и AirKaz.org, об экологии — в экспертных отчётах. Разрозненная информация "
        "замедляет принятие решений и создаёт слепые зоны.",
        styles["Body"]))
    S.append(Spacer(1, 0.2 * cm))
    S.append(Paragraph(
        "<b>AQYL CITY</b> (от казахского <i>aqyl</i> — «разум, интеллект») — это "
        "интеллектуальный слой поверх этих данных. Платформа объединяет карту, "
        "нормативы, AI-аналитику и инструменты «что если» в одном интерфейсе, "
        "понятном и акимату, и предпринимателю, и горожанину.",
        styles["Body"]))

    S.append(Spacer(1, 0.5 * cm))
    S.append(Paragraph("Главные задачи, которые решает платформа", styles["H2"]))

    tasks = [
        ("Прозрачность", "Каждый житель видит, сколько школ, садов, поликлиник и "
         "парков в его районе, и как это соотносится с нормативами СНиП РК."),
        ("Обоснованность решений", "Акимат и урбанисты получают ранжированные "
         "списки дефицитов и инструмент моделирования эффекта инвестиций."),
        ("Ускорение бизнеса", "Предприниматель за 5 минут получает ответ: где открыть "
         "кафе/салон/аптеку, исходя из населения, конкуренции и плотности бизнесов."),
        ("Защита здоровья", "Эко-режим показывает AQI, концентрацию PM2.5, "
         "главные источники загрязнения — с рекомендациями чувствительным группам."),
        ("AI-ассистент", "AQYL AI превращает данные в связные ответы и отчёты на "
         "русском языке — без знания SQL и GIS."),
    ]
    for title, body in tasks:
        S.append(Paragraph(f"<b>{title}.</b> {body}", styles["Bullet"]))

    S.append(PageBreak())

    # ---------- 2. Аудитория ----------
    S.append(Paragraph("2. Целевая аудитория и ценность", styles["H1"]))
    S.append(hr())
    S.append(Spacer(1, 0.3 * cm))

    audiences = [
        ("Акимат и городское управление",
         "Данные для генплана, оценки эффективности районных программ, ответов "
         "на жалобы жителей, приоритизации бюджета.",
         "Готовые аналитические отчёты в Markdown/PDF, ранжирование районов по "
         "нескольким метрикам, симуляция инвестиций «до/после»."),
        ("Урбанисты и архитекторы",
         "Проектирование жилых комплексов, школ, медцентров с учётом плотности и "
         "нормативов.",
         "Карта покрытия СНиП РК 3.01-01-2008, расчёт дефицитов мощности "
         "(мест в школах, коек в больницах, посещений/смена)."),
        ("Предприниматели и инвесторы",
         "Выбор локации для открытия бизнеса, анализ конкурентного поля.",
         "42 категории бизнеса, индекс конкуренции в радиусе, алгоритм «лучшая "
         "точка» со скоринг-моделью."),
        ("Жители и активисты",
         "Оценка комфорта района, проверка обещаний властей, выбор места для "
         "переезда или покупки жилья.",
         "Понятная карта, эко-оценка района, AI-чат на русском, экспорт в Markdown."),
        ("Исследователи и НКО",
         "Data-driven исследования, отчёты, кейсы для грантов и публикаций.",
         "Открытое API (26 эндпоинтов), экспорт данных, реалистичные baseline-"
         "значения по AQI, зелени, трафику для 8 районов."),
    ]

    rows = [["Кто", "Зачем", "Что получает"]]
    for a, b, c in audiences:
        rows.append([
            Paragraph(f"<b>{a}</b>", styles["Body"]),
            Paragraph(b, styles["Body"]),
            Paragraph(c, styles["Body"]),
        ])
    S.append(data_table(rows, [3.8 * cm, 6.6 * cm, 6.6 * cm]))

    S.append(PageBreak())

    # ---------- 3. Возможности ----------
    S.append(Paragraph("3. Ключевые возможности", styles["H1"]))
    S.append(hr())
    S.append(Spacer(1, 0.3 * cm))

    S.append(stat_row([
        ("3", "РЕЖИМА АНАЛИЗА", C_MINT),
        ("26", "API-ЭНДПОИНТОВ", C_CYAN),
        ("8", "РАЙОНОВ АЛМАТЫ", C_PURPLE),
        ("42", "КАТЕГОРИИ БИЗНЕСА", C_WARNING),
    ], styles))
    S.append(Spacer(1, 0.6 * cm))

    S.append(Paragraph("Что умеет платформа", styles["H2"]))

    features = [
        ("Интерактивная карта города",
         "Светлая карта Алматы с цветной маркировкой 2900+ социальных объектов и "
         "всей коммерции из OSM. Кластеризация, попапы с деталями, слои, "
         "переключатели для 9 типов объектов.",
         C_MINT),
        ("Drag-and-drop симулятор",
         "Перетащите иконку школы/садика/больницы/парка в карточку района — "
         "система мгновенно пересчитает оценку района и покажет дельту. Помогает "
         "акимату оценивать эффект инвестиций ДО их принятия.",
         C_CYAN),
        ("AQYL AI-помощник",
         "Чат-ассистент в каждом режиме, отвечает на русском языке по реальным "
         "данным из БД. Под капотом — OpenAI GPT-4o-mini с инъекцией живого контекста "
         "города. Не выдумывает: если данных нет, так и говорит.",
         C_PURPLE),
        ("Автоматические AI-отчёты",
         "Одним кликом — развёрнутая аналитическая сводка по режиму. Сводка, "
         "дефициты, лидеры, рекомендации на основе СНиП РК. Экспорт в Markdown для "
         "презентаций акимату.",
         HexColor("#EC4899")),
        ("Конкурентный анализ для бизнеса",
         "Индекс конкуренции в радиусе 1-5 км, скоринг «лучшая точка открытия» по "
         "модели население × насыщенность × ниша. Визуализация звёздочками на карте.",
         C_WARNING),
        ("Экологический мониторинг",
         "AQI по районам с сезонной поправкой, 6 загрязнителей (PM2.5, PM10, NO₂, "
         "SO₂, CO, O₃) и сравнение с ВОЗ, индекс озеленения, трафик, 8 типов эко-"
         "проблем, рекомендации чувствительным группам.",
         C_SUCCESS),
    ]
    for title, body, accent in features:
        S.append(feature_card(title, body, accent, styles))

    S.append(PageBreak())

    # ---------- 4-6. Три режима ----------
    S.append(Paragraph("4. Общественный режим", styles["H1"]))
    S.append(hr())
    S.append(Spacer(1, 0.3 * cm))

    S.append(mode_box(
        "ОБЩЕСТВЕННЫЙ · SOCIAL INFRASTRUCTURE",
        "Акимат, урбанисты, районные маслихаты, активисты, жители.",
        [
            "Недостаточное покрытие школами и детскими садами в растущих районах "
            "(Алатауский, Наурызбайский)",
            "Неравномерное распределение поликлиник и больниц",
            "Сложность обоснования инфраструктурных инвестиций",
            "Отсутствие прозрачной связи между генпланом и нормативами СНиП РК",
        ],
        [
            "Карта 2900+ социальных объектов (школы, больницы, поликлиники, "
            "детсады, аптеки, парки, пожарные части, остановки)",
            "Дашборд по каждому из 8 районов: оценка 0-100, грейд A-E, раскладка "
            "по типам с покрытием нормативов в процентах",
            "Сравнение факт/норма по всем категориям с радар-чартом",
            "Таблица мощности: сколько мест в школах, коек в больницах, "
            "посещений/смена в поликлиниках — и сколько требуется по норме",
            "Ранжирование дефицитов с выделением критических (−40%) и пограничных",
            "Drag-and-drop симулятор: моделирование добавления объектов с "
            "пересчётом оценки в реальном времени",
            "AI-помощник и экспортируемый AI-отчёт",
        ],
        C_MINT, styles,
    ))

    S.append(PageBreak())

    S.append(Paragraph("5. Бизнес-режим", styles["H1"]))
    S.append(hr())
    S.append(Spacer(1, 0.3 * cm))

    S.append(mode_box(
        "БИЗНЕС · COMMERCIAL INTELLIGENCE",
        "Предприниматели, инвесторы, франшизы, консультанты, аналитики.",
        [
            "Неочевидный выбор района для открытия бизнеса",
            "Нет быстрого способа оценить конкуренцию в точке",
            "Сложно найти «свободные ниши» и недоразвитые зоны",
            "Отсутствие данных о бизнес-плотности по категориям",
        ],
        [
            "Карта тысяч бизнесов по 42 категориям (рестораны, кафе, аптеки, "
            "салоны, АЗС, банки, отели, коворкинги и т.д.)",
            "Категории сгруппированы: еда, продукты, красота/здоровье, товары, услуги",
            "Индекс конкуренции для конкретной точки в радиусе 1-5 км (низкая/"
            "средняя/высокая) с учётом типа бизнеса",
            "Алгоритм «Лучшая точка»: топ-5 районов для открытия с оценкой 0-100 "
            "и объяснением (население, конкуренты, свободная ниша)",
            "Плотность на 10К жителей по каждому району",
            "AI-помощник: «Где открыть кофейню?» → структурированный ответ",
            "AI-отчёт по бизнес-ландшафту с топ-категориями и возможностями",
        ],
        C_WARNING, styles,
    ))

    S.append(PageBreak())

    S.append(Paragraph("6. Экологический режим", styles["H1"]))
    S.append(hr())
    S.append(Spacer(1, 0.3 * cm))

    S.append(mode_box(
        "ЭКОЛОГИЧЕСКИЙ · ENVIRONMENTAL MONITORING",
        "Жители, экологи, врачи, департамент экологии, родители, спортсмены.",
        [
            "Зимний смог Алматы — системная проблема из-за ТЭЦ, печного отопления "
            "и температурной инверсии",
            "Недостаточное озеленение (ниже нормы 16 м²/жит. в 6 из 8 районов)",
            "Автомобильные выбросы как крупнейший источник NO₂",
            "Отсутствие доступной информации о качестве воздуха по районам",
        ],
        [
            "AQI (US EPA) по каждому из 8 районов с цветовой индикацией",
            "6 главных загрязнителей: PM2.5, PM10, NO₂, SO₂, CO, O₃ в µg/m³ и "
            "mg/m³ с кратностью превышения ВОЗ",
            "Сезонная поправка (зима ×1.4, межсезонье ×1.2, лето ×0.85)",
            "Индекс озеленения (м²/жит) и его дефицит против норматива",
            "Плотность автотранспорта (авто на 1000 жителей)",
            "8 категорий эко-проблем с серьёзностью 0-100 по районам: смог, "
            "промышленные выбросы, шум, свалки, инверсия, загрязнение рек",
            "Рекомендации чувствительным группам (дети, астматики, пожилые)",
            "AI-помощник и эко-отчёт с прогнозом и советами",
        ],
        C_SUCCESS, styles,
    ))

    S.append(PageBreak())

    # ---------- 7. AI ----------
    S.append(Paragraph("7. AQYL AI — помощник и отчёты", styles["H1"]))
    S.append(hr())
    S.append(Spacer(1, 0.3 * cm))

    S.append(Paragraph(
        "<b>AQYL AI</b> — это чат-ассистент и генератор отчётов, встроенный в "
        "каждый режим. Работает поверх OpenAI GPT-4o-mini с инъекцией JSON-"
        "контекста реальных данных города. Ключевая идея: модель не рассуждает "
        "«из воздуха» — перед каждым запросом она получает компактную сводку живых "
        "цифр (население районов, AQI, счётчики школ, топ-категории бизнеса), и "
        "отвечает строго из этих данных.",
        styles["Body"]))
    S.append(Spacer(1, 0.2 * cm))

    S.append(Paragraph("Как это работает", styles["H2"]))
    S.append(Paragraph(
        "1. Пользователь задаёт вопрос в чате или нажимает «AI-отчёт».<br/>"
        "2. Backend собирает JSON-контекст под режим — 1-3 КБ с агрегатами, "
        "ранжированием, разбивкой по районам.<br/>"
        "3. Контекст + system-prompt + вопрос уходят в GPT-4o-mini.<br/>"
        "4. Модель возвращает структурированный Markdown — цифры строго из JSON, "
        "стиль под аудиторию (урбанист для public, аналитик для business, эко-"
        "эксперт для eco).<br/>"
        "5. Ответ рендерится в чате с форматированием; отчёт открывается в окне "
        "с кнопкой «Скачать .md».",
        styles["Body"]))

    S.append(Spacer(1, 0.3 * cm))
    S.append(Paragraph("Защита от галлюцинаций", styles["H2"]))
    defences = [
        "System-prompt: <i>«Используй ИСКЛЮЧИТЕЛЬНО данные из JSON-контекста, "
        "если ключа нет — говори ‘данных нет’»</i>.",
        "Контекст содержит разрез по районам с разбивкой по всем типам объектов — "
        "модель не додумывает «0».",
        "Temperature 0.35-0.4 — низкая, для фактологической задачи.",
        "Автоматический fallback на rule-based ответы при сбое OpenAI (лимит, "
        "таймаут, невалидный ключ) — интерфейс никогда не «падает».",
        "В каждом ответе возвращается поле <b>engine</b>: openai-gpt-4o-mini "
        "или aqyl-rule-v1, можно мониторить источник.",
    ]
    for d in defences:
        S.append(Paragraph(f"• {d}", styles["Bullet"]))

    S.append(Spacer(1, 0.3 * cm))
    S.append(Paragraph("Примеры вопросов", styles["H2"]))
    examples = [
        "«В каком районе меньше всего школ?» → рейтинг 8 районов с числом школ и покрытием норматива",
        "«Где лучше открыть кофейню и почему?» → топ-3 района с обоснованием по населению и конкуренции",
        "«Какой воздух в Медеуском сегодня?» → AQI, загрязнители, советы чувствительным группам",
        "«Какие главные экологические проблемы?» → ранжированный список с серьёзностью и худшими районами",
    ]
    for e in examples:
        S.append(Paragraph(f"• {e}", styles["Bullet"]))

    S.append(PageBreak())

    # ---------- 8. Симулятор ----------
    S.append(Paragraph("8. What-if симулятор градостроительных решений", styles["H1"]))
    S.append(hr())
    S.append(Spacer(1, 0.3 * cm))

    S.append(Paragraph(
        "Уникальная фича платформы. В общественном режиме слева расположена "
        "<b>палитра иконок</b>: школа, детсад, больница, поликлиника, аптека, "
        "парк, пожарная часть, остановка. Пользователь перетаскивает иконку "
        "мышью на карточку района — backend получает запрос и моделирует «новый» "
        "район.",
        styles["Body"]))
    S.append(Spacer(1, 0.2 * cm))

    S.append(Paragraph("Алгоритм (backend)", styles["H2"]))
    S.append(Paragraph(
        "<b>POST /api/v1/simulate/district</b> с параметрами district_id и "
        "additions (словарь типов → количество). Сервис:<br/>"
        "1. Берёт текущие счётчики всех типов в районе.<br/>"
        "2. Добавляет изменения, не пуская счётчик ниже нуля.<br/>"
        "3. Пересчитывает <i>FacilityStatDetail</i> по каждому типу: факт, норма, "
        "дефицит, покрытие в %.<br/>"
        "4. Пересчитывает общую оценку района (среднее покрытие по ≤100%).<br/>"
        "5. Формирует рекомендации «что ещё добавить, чтобы достичь 100%».<br/>"
        "6. Возвращает before/after/delta и список рекомендаций.",
        styles["Body"]))

    S.append(Spacer(1, 0.3 * cm))
    S.append(Paragraph("Для чего это нужно", styles["H2"]))
    needs = [
        "<b>Акимат.</b> Оценка эффекта инвестиций до их принятия: «если построим "
        "2 школы в Алатауском — оценка вырастет с 82.7 до 85.4».",
        "<b>Урбанисты.</b> Быстрая проверка гипотез по генплану без Excel-моделей.",
        "<b>Депутаты маслихата.</b> Обоснование приоритизации бюджетов районов.",
        "<b>Образование.</b> Наглядная визуализация для презентаций в акимате.",
        "<b>Партиципаторный бюджет.</b> Инструмент для жителей — выбрать "
        "приоритет из нескольких сценариев строительства.",
    ]
    for n in needs:
        S.append(Paragraph(f"• {n}", styles["Bullet"]))

    S.append(PageBreak())

    # ---------- 9. Data sources ----------
    S.append(Paragraph("9. Источники данных", styles["H1"]))
    S.append(hr())
    S.append(Spacer(1, 0.3 * cm))

    S.append(Paragraph(
        "Платформа агрегирует данные из публичных и открытых источников. Никаких "
        "закрытых баз, никаких персональных данных. Все цифры воспроизводимы.",
        styles["Muted"]))
    S.append(Spacer(1, 0.3 * cm))

    src_rows = [
        ["Источник", "Что даёт", "Объём", "Статус"],
        ["OpenStreetMap (Overpass API)",
         "Школы, больницы, поликлиники, детсады, аптеки, парки, пожарные, "
         "остановки + вся коммерция (42 категории)",
         "2 900+ социальных + тысячи бизнесов",
         "активный"],
        ["alag.kz",
         "Школы с БИН и официальными названиями",
         "30 записей (API лимитирует)",
         "ограничен"],
        ["stat.gov.kz",
         "Население 8 районов, половозрастная структура, прирост",
         "XLSX, обновление ежеквартально",
         "fallback 2026"],
        ["data.egov.kz",
         "Медицинские организации РК (API v4)",
         "Для Алматы — пусто",
         "API ключ готов"],
        ["AirKaz.org + Казгидромет",
         "Baseline AQI по районам 2023-2025, сезонные паттерны смога",
         "8 районов, мониторинг 24/7",
         "baseline+сезон"],
        ["СНиП РК 3.01-01-2008",
         "Нормативы: 1,5 школ/10К, 0,4 больниц/10К, 1,2 садов/10К, парки "
         "6 м²/жит и т.д.",
         "Нормативная база",
         "встроено"],
        ["ВОЗ (WHO)",
         "24-ч безопасные концентрации: PM2.5 15, PM10 45, NO₂ 25 µg/m³",
         "Медицинские стандарты",
         "встроено"],
    ]
    rows = [[Paragraph(c, styles["Body"]) if isinstance(c, str) else c for c in r]
            for r in src_rows]
    S.append(data_table(rows, [4.5 * cm, 6 * cm, 3.5 * cm, 2.5 * cm]))

    S.append(Spacer(1, 0.4 * cm))
    S.append(Paragraph("Что важно знать", styles["H2"]))
    caveats = [
        "Привязка объектов к районам MVP-приближением (bounding boxes), не "
        "PostGIS spatial join — план на следующую итерацию.",
        "AQI в текущей версии — baseline с сезонной поправкой и детерминированным "
        "шумом по дате. Замена на live IQAir / airkaz.org — одна функция в "
        "<i>eco_analytics.py</i>.",
        "Соц. инфраструктура без district_id распределяется пропорционально "
        "населению — даёт ~90% точности на уровне района.",
    ]
    for c in caveats:
        S.append(Paragraph(f"• {c}", styles["Bullet"]))

    S.append(PageBreak())

    # ---------- 10. Tech ----------
    S.append(Paragraph("10. Технологическая архитектура", styles["H1"]))
    S.append(hr())
    S.append(Spacer(1, 0.3 * cm))

    S.append(Paragraph(
        "Современный open-source стек. Разворачивается локально одной командой "
        "(docker compose). Горизонтально масштабируется, каждый слой заменяем.",
        styles["Body"]))

    S.append(Spacer(1, 0.3 * cm))
    S.append(Paragraph("Стек", styles["H2"]))
    tech_rows = [
        ["Слой", "Технологии", "Роль"],
        ["Frontend", "React 18, TypeScript 5.6, Vite 6, React-Leaflet, Recharts",
         "Интерактивный UI, карта, чарты, dark-тема с mint/cyan брендингом"],
        ["Карта", "Carto Voyager тайлы (OSM-derived), MarkerCluster",
         "Светлая читаемая карта с кластеризацией маркеров"],
        ["Backend", "FastAPI 0.115, Python 3.11+, Pydantic 2, Uvicorn",
         "REST API (26 эндпоинтов), автодокументация OpenAPI/Swagger"],
        ["БД", "PostgreSQL 16 + PostGIS 3.4, SQLAlchemy 2.0, Alembic",
         "Пространственные данные, миграции, геозапросы"],
        ["AI", "OpenAI GPT-4o-mini (API), локальный rule-based fallback",
         "Чат-ассистент и генерация отчётов с контекстом"],
        ["Data pipeline", "httpx, openpyxl, Overpass API, retry+backoff",
         "Сбор данных из OSM, stat.gov.kz, alag.kz, egov.kz"],
        ["Инфра", "Docker Compose, pnpm/npm",
         "Локальное развёртывание, CI-ready"],
    ]
    rows = [[Paragraph(c, styles["Body"]) for c in r] for r in tech_rows]
    S.append(data_table(rows, [3 * cm, 6 * cm, 8 * cm]))

    S.append(Spacer(1, 0.3 * cm))
    S.append(Paragraph("Компоненты Backend", styles["H2"]))
    S.append(Paragraph(
        "<b>services/analytics.py</b> — per-district аналитика, coverage gaps<br/>"
        "<b>services/statistics.py</b> — расчёт нормативов, FacilityStatDetail<br/>"
        "<b>services/norms.py</b> — СНиП РК 3.01-01-2008<br/>"
        "<b>services/business_analytics.py</b> — конкуренция, find_best_locations<br/>"
        "<b>services/eco_analytics.py</b> — AQI, загрязнители, эко-score<br/>"
        "<b>services/simulator.py</b> — what-if пересчёт района<br/>"
        "<b>services/ai_assistant.py</b> — чат + отчёты, OpenAI integration",
        styles["Body"]))

    S.append(PageBreak())

    # ---------- 11. Use cases ----------
    S.append(Paragraph("11. Сценарии использования", styles["H1"]))
    S.append(hr())
    S.append(Spacer(1, 0.3 * cm))

    cases = [
        ("Акимат готовит бюджет на 2027 год",
         "Заместитель акима открывает общественный режим, кликает поочерёдно по "
         "каждому району. Видит, что Алатауский и Наурызбайский — самые "
         "проблемные по школам. В симуляторе добавляет 3 школы в Алатауский и "
         "2 в Наурызбайский — оценки вырастают с 82.7 до 86.4. Генерирует "
         "AI-отчёт, экспортирует Markdown, вставляет в презентацию для "
         "городского маслихата."),
        ("Предприниматель хочет открыть кофейню",
         "Запускает бизнес-режим, выбирает категорию «Кофейни». Нажимает "
         "«Найти лучшую точку». Получает ранжирование: Наурызбайский — 0.1 "
         "кофейни на 10К, население 242К — лучшая ниша. Сравнивает с Медеуским "
         "и Ауэзовским, открывает AQYL AI и спрашивает «Какие районы в Алматы "
         "с самой быстрорастущей молодёжью?». Принимает решение."),
        ("Мама беспокоится о здоровье ребёнка",
         "Открывает эко-режим, видит что в их Жетысуском районе AQI 166 "
         "(«Вредный»). В деталях района читает: главный источник — зимний смог "
         "от ТЭЦ, PM2.5 превышает норму ВОЗ в 5.7 раз. В AQYL AI спрашивает "
         "«Стоит ли ребёнку гулять утром?» — получает совет от AI."),
        ("Журналист готовит материал о неравенстве районов",
         "Заходит в статистику, переключается между вкладками public/business/eco. "
         "Экспортирует три AI-отчёта в Markdown. Использует данные в статье, "
         "ссылается на источники (СНиП РК, ВОЗ, OSM)."),
        ("Студент-урбанист пишет курсовую",
         "Использует открытое API платформы (26 эндпоинтов), выгружает GeoJSON "
         "для карт в QGIS, цитирует методологию. AQYL AI помогает быстро "
         "ориентироваться в цифрах."),
    ]
    for title, body in cases:
        S.append(Paragraph(f"<b>{title}</b>", styles["H3"]))
        S.append(Paragraph(body, styles["Body"]))
        S.append(Spacer(1, 0.2 * cm))

    S.append(PageBreak())

    # ---------- 12. Roadmap ----------
    S.append(Paragraph("12. Развитие и дорожная карта", styles["H1"]))
    S.append(hr())
    S.append(Spacer(1, 0.3 * cm))

    S.append(Paragraph("Что уже готово (v1.0 · 2026)", styles["H2"]))
    done = [
        "Три полноценных режима: общественный, бизнес, экологический",
        "AQYL AI с OpenAI GPT-4o-mini и rule-based fallback",
        "AI-отчёты с экспортом в Markdown",
        "Drag-and-drop симулятор градостроительных решений",
        "26 REST-эндпоинтов с OpenAPI документацией",
        "Dark-тема с фирменным брендингом (mint→cyan)",
        "8 районов Алматы с реалистичными baseline-данными",
    ]
    for d in done:
        S.append(Paragraph(f"✓ {d}", styles["Bullet"]))

    S.append(Spacer(1, 0.3 * cm))
    S.append(Paragraph("Ближайшие итерации", styles["H2"]))
    next_steps = [
        "<b>Live AQI.</b> Интеграция с IQAir или airkaz.org — real-time замены "
        "baseline значений для воздуха.",
        "<b>PostGIS spatial join.</b> Точная привязка объектов к районам через "
        "полигоны вместо bounding box — даст +10% точности.",
        "<b>Прогнозирование AQI.</b> Time-series модель на часовых замерах "
        "Казгидромета для прогноза на 24-72 часа.",
        "<b>Экспорт в PDF.</b> Отчёты в формате акимата (обложка, "
        "колонтитулы, таблицы) через WeasyPrint или PrinceXML.",
        "<b>Мобильная версия.</b> Адаптив уже работает, нужен hamburger для "
        "панели и touch-friendly drag-drop.",
        "<b>Голосовой ввод.</b> Интеграция Whisper API в AQYL AI — «Алматы, "
        "где плохо с воздухом?».",
        "<b>Казахский язык.</b> Локализация UI и prompt’ов для казахскоязычных "
        "пользователей.",
        "<b>Публичный API.</b> Тарифы для исследователей, СМИ, НКО.",
    ]
    for n in next_steps:
        S.append(Paragraph(f"→ {n}", styles["Bullet"]))

    S.append(Spacer(1, 0.5 * cm))

    # Закрывающая плашка
    footer_tbl = Table(
        [[
            Paragraph(
                "<b>AQYL CITY — Smart City Intelligence Platform</b><br/>"
                "<font color='#64748B'>Проект Enactus · Almaty, Kazakhstan · 2026<br/>"
                "Открытый исходный код · Данные из публичных источников<br/>"
                "<i>Контакты: tleubekov.super@gmail.com</i></font>",
                styles["Body"],
            )
        ]],
        colWidths=[17 * cm],
        style=TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), HexColor("#FAFBFC")),
            ("BOX", (0, 0), (-1, -1), 0.5, C_MINT),
            ("LEFTPADDING", (0, 0), (-1, -1), 16),
            ("RIGHTPADDING", (0, 0), (-1, -1), 16),
            ("TOPPADDING", (0, 0), (-1, -1), 14),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 14),
        ]),
    )
    S.append(footer_tbl)

    return S


# -------- Главная функция --------
def main():
    _register_fonts()

    doc = BaseDocTemplate(
        str(OUT_PDF),
        pagesize=A4,
        leftMargin=2 * cm, rightMargin=2 * cm,
        topMargin=2.2 * cm, bottomMargin=2.2 * cm,
        title="AQYL CITY — Smart City Intelligence Platform",
        author="AQYL CITY Team · Enactus",
        subject="Платформа городской аналитики для Алматы",
    )

    # Фрейм обложки на всю страницу
    cover_frame = Frame(0, 0, A4[0], A4[1], leftPadding=0, rightPadding=0,
                        topPadding=0, bottomPadding=0, id="cover")
    # Обычный фрейм с полями
    body_frame = Frame(
        2 * cm, 2.2 * cm,
        A4[0] - 4 * cm, A4[1] - 4.4 * cm,
        id="body",
    )

    doc.addPageTemplates([
        PageTemplate(id="Cover", frames=[cover_frame], onPage=draw_cover_background),
        PageTemplate(id="Body", frames=[body_frame], onPage=draw_page_decorations),
    ])

    styles = build_styles()
    story = build_story(styles)
    # Переключаем на Body-шаблон после обложки
    from reportlab.platypus import NextPageTemplate
    story.insert(1, NextPageTemplate("Body"))

    doc.build(story)
    print(f"PDF saved: {OUT_PDF}")
    print(f"Size: {OUT_PDF.stat().st_size / 1024:.1f} KB")


if __name__ == "__main__":
    main()
