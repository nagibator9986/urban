# AQYL CITY — Smart City Intelligence Platform (Almaty)

> AQYL (қазақша «ум, интеллект») + CITY = «интеллект города». Платформа
> городской аналитики нового поколения. Три режима, AI-помощник, AI-отчёты,
> симулятор градостроительных решений.

---

## Миссия и продукт

AQYL CITY — единая рабочая среда для акимата, бизнеса и жителей Алматы.
Превращает разрозненные данные (OSM, alag.kz, stat.gov.kz, data.egov.kz,
мониторинг воздуха) в конкретные управленческие решения.

### Три режима

| Режим | Для кого | Что даёт |
|---|---|---|
| **Общественный** | Акимат, урбанисты, активисты | Карта соц.инфраструктуры, дефициты по СНиП РК, drag-drop симулятор «что если добавим школу в район» |
| **Бизнес** | Предприниматели, инвесторы | Карта коммерции, конкурентный анализ, алгоритм поиска лучшей точки открытия |
| **Экологический** | Жители, экологи, депздрав | AQI по районам, PM2.5/PM10/NO₂/SO₂/CO/O₃, озеленение, трафик, приоритет эко-проблем |

Каждый режим получил:
- **AQYL AI** — чат-помощник в правой доке, отвечает на вопросы на основе реальных данных БД.
- **AI-отчёт** — автоматическая аналитическая сводка в Markdown, просмотр + экспорт.
- Дашборд-вкладку в разделе «Статистика» с чартами и таблицами.

### Ключевая фича (уникальная)

**Drag-and-drop симулятор в общественном режиме.** Пользователь
перетаскивает иконку (школа 🎓 / садик 🧸 / поликлиника 🩺 / …) в карточку
района — backend мгновенно пересчитывает покрытие нормативов, общую
оценку района и дельту. Зелёная/красная подсветка показывает эффект
инвестиций в реальном времени. Основа для принятия решений акиматом.

---

## Стек

**Backend**
- Python 3.11+, FastAPI 0.115, Uvicorn
- SQLAlchemy 2.0 + GeoAlchemy2 + PostGIS
- Alembic (миграции)
- httpx, openpyxl, shapely, geojson

**Frontend**
- React 18 + TypeScript 5.6 + Vite 6
- React-Leaflet + MarkerCluster (Carto Dark tiles)
- Recharts для визуализации
- React-Router 7

**БД/инфра**
- PostgreSQL 16 + PostGIS 3.4 (порт **5433** на хосте — 5432 занят)
- Docker Compose

**Брендинг**
- Лого: `logos/image copy 5.png` → `frontend/public/aqyl-logo.png`
  (стилизованные горы Заилийского Алатау — визитная карточка Алматы).
- Палитра: mint `#2DD4BF` → cyan `#22D3EE` градиент, dark surface `#0A0F1A`.
- Типографика: Inter (UI), JetBrains Mono (code).

---

## Архитектура

```
AQYL CITY
├── backend/app/
│   ├── main.py                      FastAPI + 5 роутеров
│   ├── models/                      SQLAlchemy модели
│   │   ├── district.py, facility.py, population.py, business.py
│   ├── collectors/                  Data collectors (внешние API)
│   │   ├── osm_collector.py         OSM Overpass — соц. + бизнес
│   │   ├── alag_collector.py        alag.kz (school БИН, cursor pagination)
│   │   ├── stat_collector.py        stat.gov.kz (XLSX population)
│   │   ├── egov_collector.py        data.egov.kz (медорганизации)
│   │   ├── business_collector.py    OSM бизнес-сбор
│   │   └── run_all.py               Оркестратор
│   ├── services/                    Бизнес-логика (stateless)
│   │   ├── analytics.py             get_district_analytics, coverage_gaps
│   │   ├── statistics.py            _compute_facility_stat, overall_score
│   │   ├── norms.py                 Нормативы СНиП РК 3.01-01-2008
│   │   ├── business_analytics.py    competition index, find_best_locations
│   │   ├── eco_analytics.py         🆕 AQI, pollutants, green, issues
│   │   ├── simulator.py             🆕 what-if district recalc
│   │   └── ai_assistant.py          🆕 chat router + report generator
│   └── api/
│       ├── routes.py                /districts /facilities /analytics /statistics
│       ├── business_routes.py       /business/*
│       ├── eco_routes.py            🆕 /eco/*
│       ├── ai_routes.py             🆕 /ai/chat /ai/report/{mode}
│       └── simulator_routes.py      🆕 /simulate/district
│
├── frontend/src/
│   ├── App.tsx                      Router (5 маршрутов)
│   ├── main.tsx
│   ├── styles/index.css             🆕 Полная дизайн-система (dark+brand)
│   ├── types/index.ts               Все типы (facilities, business, eco, AI)
│   ├── services/api.ts              Axios клиент — все эндпоинты
│   ├── components/
│   │   ├── shell/
│   │   │   ├── AppShell.tsx         🆕 Rail + topbar layout
│   │   │   └── Icons.tsx            🆕 минимальные SVG иконки (zero-deps)
│   │   ├── map/BaseMap.tsx          🆕 Карта с Carto Dark tiles
│   │   ├── public/FacilityLayers.tsx Слои + кластеры соц.объектов
│   │   ├── ai/
│   │   │   ├── AIAssistant.tsx      🆕 Dockable chat-панель
│   │   │   └── AIReportModal.tsx    🆕 Модалка отчёта + Markdown + export
│   │   └── ui/markdown.ts           🆕 Лёгкий MD→HTML рендерер
│   └── pages/
│       ├── PublicMode.tsx           🆕 Общественный режим + drag-drop
│       ├── BusinessMode.tsx         🆕 Бизнес + best location
│       ├── EcoMode.tsx              🆕 Эко + AQI на карте
│       ├── StatsMode.tsx            🆕 Дашборд 3-в-1 с табами
│       └── AIReportsHub.tsx         🆕 Хаб AI-отчётов
│
├── logos/                            Исходники брендинга
├── frontend/public/aqyl-logo.png     Активное лого
├── docker-compose.yml
└── CLAUDE.md                         ← вы здесь
```

---

## API (v1)

### Общественный режим
- `GET  /api/v1/districts`                     список районов + население
- `GET  /api/v1/facilities?facility_type=X`    объекты
- `GET  /api/v1/facilities/geojson`            GeoJSON FeatureCollection
- `GET  /api/v1/analytics/overview`            сводка + coverage_gaps
- `GET  /api/v1/analytics/districts`           аналитика по районам
- `GET  /api/v1/statistics`                    детали с нормативами
- `GET  /api/v1/statistics/norms`              SNIP РК справочник

### Бизнес-режим
- `GET  /api/v1/business/categories`           группы категорий
- `GET  /api/v1/business/counts`               count by category
- `GET  /api/v1/business/by-district`          по районам + per 10K
- `GET  /api/v1/business/geojson?category=X`
- `GET  /api/v1/business/competition?category=X&lat=&lon=&radius_km=`
- `GET  /api/v1/business/best-locations?category=X&top_n=5`
- `GET  /api/v1/business/summary`

### 🆕 Экологический режим
- `GET  /api/v1/eco/overview`                  город + 8 районов
- `GET  /api/v1/eco/districts/{name}`          полный профиль района
- `GET  /api/v1/eco/districts`                 baseline AQI list

### 🆕 AI
- `POST /api/v1/ai/chat`  `{mode, message}` → `{answer, intent, …}`
- `GET  /api/v1/ai/report/{mode}`              mode ∈ public/business/eco

### 🆕 Симулятор
- `POST /api/v1/simulate/district`
  ```json
  { "district_id": 3, "additions": {"school": 2}, "removals": {} }
  ```
  → `{ before:{score}, after:{score}, delta_score, recommendations: […] }`

---

## Команды

```bash
# Backend
cd backend && python3 -m uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend && npm run dev             # http://localhost:5173
cd frontend && npm run build           # production build

# БД
docker compose up -d db

# Сбор данных (читает из OSM / stat.gov.kz / alag.kz / egov)
cd backend && python3 -m app.collectors.run_all
cd backend && python3 -m app.collectors.business_collector

# Smoke-тест импорта backend
python3 -c "from app.main import app; print(len(app.routes), 'routes')"
```

---

## Данные и нормативы

### Источники
| Источник | Что даёт | Статус |
|---|---|---|
| **OSM (Overpass)** | Школы 267 · Больницы 78 · Поликлиники 91 · Детсады 199 · Аптеки 340 · Парки 130 · Пожарные 18 · Остановки 1743 · 8 районов + вся коммерция | ✅ рабочий |
| **alag.kz** | Школы с БИН (30 записей, API лимитирует) | ⚠️ cursor-пагинация, не offset |
| **stat.gov.kz** | Население по 8 районам (XLSX) | ✅ fallback hardcoded 2026 |
| **data.egov.kz** | Медорганизации (API v4) | ⚠️ для Алматы пустые данные |
| **AirKaz.org / Казгидромет** | Baseline AQI по районам 2023-2025 | ✅ зашитые реалистичные значения + сезон-коэффициент |

### 8 районов Алматы
Алмалинский, Алатауский, Ауэзовский, Бостандыкский, Жетысуский,
Медеуский, Наурызбайский, Турксибский.

### Нормативы (СНиП РК 3.01-01-2008)
Зашиты в `backend/app/services/norms.py` — школы 1.5/10К (850 мест),
больницы 0.4/10К (250 коек), поликлиники 0.5/10К (500 посещений/смена),
детсады 1.2/10К (200 мест), аптеки 1.5/10К, парки 6 м²/жит,
пожарные 0.1/10К, остановки 8/10К.

### Эко baseline
`eco_analytics.py:DISTRICT_BASELINE_AQI` — усреднённые значения AQI
2023-2025, с сезонным коэффициентом (зима ×1.4, лето ×0.85) и
детерминированным шумом по дате. Озеленение и трафик — публичные цифры
мониторинга города.

---

## AI-помощник: принцип работы

**Двухуровневая архитектура** в `services/ai_assistant.py`:

1. **Intent router** — 9 паттернов (worst_district, best_district, deficit,
   air_quality, green, traffic, competition, where_open, general).
   Работает offline по реальным данным из БД.
2. **LLM-escape hatch** — если задан `OPENAI_API_KEY`/`ANTHROPIC_API_KEY`,
   можно подключить внешний LLM (сейчас заглушка, возвращает локальный
   ответ для устойчивости).

AI-отчёты (`generate_report`) — три Markdown-шаблона:
сводка + дефициты + лидеры + отстающие + рекомендации.
Экспортируются в `.md` из UI.

---

## Важные инварианты / gotchas

- **PostgreSQL порт 5433.** 5432 занят другим контейнером. Менять нельзя.
- **Overpass API** retry с backoff, 15сек между запросами.
- **alag.kz**: cursor-пагинация, `offset` не работает, max 30 записей.
- **data.egov.kz**: field names отличаются от доков (`area_name` вместо `region`).
- **Координаты Алматы:** центр `43.238, 76.946`, bounds `[[43.08,76.6],[43.45,77.2]]`.
- **Маппинг бизнеса к району** — bounding boxes (`business_analytics.py:DISTRICT_BOUNDS`),
  не PostGIS spatial join — это MVP-приближение.
- **Социальная инфраструктура** при отсутствии `district_id` распределяется
  **пропорционально населению** — аналитика в `services/analytics.py`.
- **Carto Dark tiles** (frontend) — free tier, OSM-derived. Если будет
  лимит — заменить на `{s}.tile.openstreetmap.org/...` (светлый).
- **Symbol keys** в `FACILITY_LABELS` / `FACILITY_COLORS` должны совпадать
  с enum `FacilityType` в backend.
- **Русская локализация** повсеместно. Все строки UI — ru-RU.

---

## Дизайн-система (frontend/src/styles/index.css)

CSS-переменные в `:root`:
- `--brand-grad: linear-gradient(135deg, #2DD4BF 0%, #22D3EE 100%)`
- Surfaces: `--bg #0A0F1A`, `--surface #111827`, `--surface-2 #18212F`
- Brand: `--brand-1 #2DD4BF` (mint), `--brand-2 #22D3EE` (cyan)
- Semantic: success/warning/danger + purple (eco)
- Layout: `--rail-w 84px`, `--panel-w 380px`, `--ai-panel-w 420px`

**Классы первого уровня** (всё задокументировано в CSS по секциям):
`.shell .rail .panel .work-body`, `.card .card-glass .stat .chip .btn`,
`.ai-dock .ai-msg .ai-compose`, `.modal-backdrop .modal`,
`.aqi-hero .aqi-gauge .pollutants .issue-list`,
`.palette .palette-item .district-card .sim-badge`.

---

## Расширение

### Добавить новый тип соц. объекта
1. `backend/app/models/facility.py:FacilityType` — новый enum.
2. `backend/app/services/norms.py` — норматив.
3. `backend/app/collectors/osm_collector.py` — Overpass query.
4. `frontend/src/types/index.ts` — `FacilityType` + `FACILITY_LABELS`/`COLORS`/`EMOJI`.
5. (опц.) `DROP_TYPES` в `PublicMode.tsx`, если должен быть перетаскиваемым.

### Добавить новую категорию бизнеса
1. `backend/app/models/business.py:BusinessCategory` enum + label + group.
2. `backend/app/collectors/business_collector.py` — mapping OSM tags.
3. `frontend/src/types/index.ts:BUSINESS_COLORS`.

### Подключить настоящий LLM
В `backend/app/services/ai_assistant.py:chat()` — заменить блок
«если есть API_KEY» на реальный вызов Anthropic/OpenAI SDK. Контекст:
достаточно передать mode + question + соответствующий service call
(get_city_statistics / get_city_eco / …). Кешировать разумно.

### Подключить live IQAir
В `backend/app/services/eco_analytics.py` функция `_district_aqi` сейчас
возвращает baseline+сезон+шум. Заменить на httpx-запрос к IQAir API,
либо к airkaz.org (публичный JSON). Сохранить ту же сигнатуру —
UI не изменится.

---

## Статус

**v1.0 — 2026-04-22.** Полный redesign, все три режима рабочие,
AI-помощник + AI-отчёты в каждом режиме, drag-drop симулятор в общественном,
эко-режим с AQI/pollutants/green/traffic/issues, унифицированный
дашборд-хаб. TypeScript чист, Vite build проходит. Backend импортируется,
26 роутов.

Следующие возможные итерации:
- PostGIS spatial join для точной привязки объектов к районам
- Live AQI через IQAir / airkaz.org
- Полноценный LLM-бэкенд с кешированием ответов
- Прогнозирование AQI (time-series на часовом мониторинге)
- Экспорт отчётов в PDF (PrinceXML / weasyprint)
- Мобильный веб (адаптив уже есть, но нужен hamburger для панели)
