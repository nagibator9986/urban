# 🚀 Деплой AQYL CITY на Render

One-click через Blueprint `render.yaml`. Поднимает 3 сервиса:
- 🗄 **PostgreSQL 16** (с PostGIS — создаётся автоматически при старте)
- 🐍 **Backend FastAPI** (Docker)
- ⚛️ **Frontend** (статический Vite SPA)

Время: **15-25 минут** на первый деплой (сборка Docker-образа дольше всего).

---

## 📋 Что нужно перед началом

1. **Аккаунт на render.com** (вход через GitHub).
2. **Аккаунт на GitHub** + репозиторий с этим проектом.
3. (Опционально) **OpenAI API key** для AI-фич. Без него работают rule-based fallback'и.

---

## 1️⃣ Залить проект на GitHub

```bash
cd /path/to/almaty-urban-analytics
git init
git add .
git commit -m "Initial commit"

# Создай репо на github.com (например aqyl-city), затем:
git remote add origin https://github.com/<your-username>/aqyl-city.git
git branch -M main
git push -u origin main
```

> ⚠️ Проверь что `.env` **не попал** в коммит (`.gitignore` его исключает).

---

## 2️⃣ One-click deploy через Render Blueprint

1. Зайди на **[dashboard.render.com](https://dashboard.render.com)** → Top-right **"New +"** → **"Blueprint"**.
2. **Connect GitHub** → выбери репозиторий `aqyl-city`.
3. Render найдёт `render.yaml` и покажет 3 сервиса:
   - `aqyl-postgres` (database)
   - `aqyl-api` (backend)
   - `aqyl-web` (frontend)
4. Нажми **"Apply"** → подтверди.

Render начнёт:
- Создавать БД (1-2 мин)
- Собирать backend Docker (5-8 мин при первом разе)
- Билдить frontend (2-3 мин)

---

## 3️⃣ ⚠️ Обязательно: связать фронт с бэком (VITE_API_URL)

Render не умеет автоматически проставить публичный URL бэкенда во фронт через
`fromService` — поле `host` возвращает internal DNS name (`aqyl-api`), не
публичный URL. Поэтому после первого деплоя:

1. Открой сервис **`aqyl-api`** → сверху скопируй публичный URL вида
   `https://aqyl-api-xxxxxxxxxx.onrender.com`.
2. Открой **`aqyl-web`** → вкладка **Environment**.
3. Найди переменную `VITE_API_URL` (она будет с пометкой "set manually").
4. Вставь скопированный URL → **Save Changes**.
5. Render автоматически пересоберёт фронт за 2-3 мин.

> 💡 Можно с `https://` или без — frontend в [services/api.ts](frontend/src/services/api.ts)
> сам добавит scheme.

---

## 4️⃣ Настроить OPENAI_API_KEY (опционально)

Если есть OpenAI-ключ:
1. Render Dashboard → `aqyl-api` → **Environment**
2. Найди `OPENAI_API_KEY` → "Edit" → вставь свой ключ.
3. **Save Changes** → сервис автоматически перезапустится.

Без ключа всё работает — AI отвечает rule-based.

---

## 5️⃣ Подправить CORS (после первого деплоя)

После того как фронт получил URL вида `https://aqyl-web-xxx.onrender.com`:
1. Скопируй URL фронта.
2. Backend → Environment → `CORS_ORIGINS` → впиши:
   ```
   https://aqyl-web-xxx.onrender.com,http://localhost:5173
   ```
3. Save Changes (backend перезапустится).

---

## 6️⃣ Заполнить БД данными (один раз)

База будет пустой после первого старта. Залей реальные данные через collectors:

### Вариант A: Прямо на Render через Shell
1. `aqyl-api` → **Shell** (Render даёт интерактивный SSH).
2. Выполни:
   ```bash
   python -m app.collectors.run_all          # OSM, alag, stat, egov
   python -m app.collectors.business_collector  # бизнес из OSM
   ```
3. Дождись окончания (~10-15 мин — Overpass API медленный, делает много запросов).

### Вариант B: Локально → загрузить в Render Postgres
1. Render Dashboard → `aqyl-postgres` → скопируй **External Database URL**.
2. Локально:
   ```bash
   export DATABASE_URL="postgresql://...render.com/almaty_analytics?sslmode=require"
   cd backend
   python -m app.collectors.run_all
   python -m app.collectors.business_collector
   ```
3. Это медленнее (трафик до Render), но не ест Render-Shell timeout.

---

## 7️⃣ Включить Keep-Alive (чтобы не было cold start)

Render Free засыпает через **15 минут** простоя — первый запрос потом 30-50 сек.

**Решение**: бесплатный пинг каждые 14 минут на `/health`:
1. **[uptimerobot.com](https://uptimerobot.com)** → New Monitor → HTTP(s).
2. URL: `https://aqyl-api-xxx.onrender.com/health`
3. Interval: **5 minutes** (free tier даёт от 5 мин).
4. Готово. Сервис не заснёт.

---

## ✅ Проверка

1. Открой `https://aqyl-web-xxx.onrender.com` → должен загрузиться фронт.
2. Нажми **"Профиль"** в topbar → откроется модалка.
3. Открой `https://aqyl-api-xxx.onrender.com/health` → `{"status": "ok"}`.
4. Открой `https://aqyl-api-xxx.onrender.com/docs` → Swagger со всеми 67 endpoints.

---

## 🛠 Что делать если что-то пошло не так

### Backend `Service unavailable` после deploy
- Проверь логи `aqyl-api` → **Logs**.
- Частые причины:
  - `DATABASE_URL` не подхватился — Render должен сам прописать через Blueprint.
  - PostGIS не создался — посмотри ошибку в логах startup-скрипта.
  - Не хватило памяти (free tier 512 MB) — упрости collectors или ограничь параллелизм.

### Frontend кажет белый экран / 404
- `_redirects` (`/* /index.html 200`) лежит в `frontend/public/_redirects` — проверь что файл закоммичен.
- `VITE_API_URL` не подхватился — посмотри Network в DevTools, куда летят запросы `/api/v1/...`. Если на свой же домен — env-var не сработала. Проверь `aqyl-web` → Environment.

### CORS errors в консоли браузера
- Backend `CORS_ORIGINS` env должен **точно** содержать URL фронта.
- Без `/` в конце.
- Если несколько origin'ов — через `,` без пробелов.

### "PostGIS extension does not exist"
- На Render free Postgres PostGIS должен быть доступен.
- Если ошибка — открой Render Postgres → External Connection → подключись `psql` и руками:
  ```sql
  CREATE EXTENSION IF NOT EXISTS postgis;
  ```
- Старт-скрипт делает это автоматически при каждом deploy.

### `/futures/optimize` падает с timeout
- Render free request timeout = 100 сек. Optimizer с 60 итерациями может не успеть.
- В UI Futures Optimizer уменьши **Iterations** до 16-24.
- Или используй платный план Render (от $7/мес → нет timeout).

---

## ⏰ Через 90 дней

**Render free Postgres истекает через 90 дней.** Варианты:

1. **Платный Postgres на Render** — $7/мес.
2. **Перенести на Neon** (бессрочный free):
   - Зарегистрируйся на [neon.tech](https://neon.tech).
   - Create project → Postgres 16 → SQL Editor → `CREATE EXTENSION postgis`.
   - Скопируй connection string.
   - На Render → `aqyl-api` → Environment → замени `DATABASE_URL` на Neon URL.
   - Перезапусти backend → миграция данных через `pg_dump | pg_restore`.

---

## 📊 Лимиты Render Free на проект

| Ресурс | Лимит | Влияние |
|---|---|---|
| **Backend RAM** | 512 MB | Хватает с запасом для FastAPI + 5K объектов |
| **Backend hours** | 750 ч/мес | ≈ 24/7 если ровно 1 сервис |
| **Backend timeout** | 100 сек/request | `/futures/optimize` с 60+ итер может упасть |
| **Sleep idle** | 15 мин | Решается UptimeRobot |
| **Cold start** | 30-50 сек | Только после 15-мин простоя |
| **Postgres storage** | 1 GB | Хватает на десятилетия |
| **Postgres срок** | 90 дней | Перенос на Neon перед expire |
| **Static traffic** | 100 GB/мес | Очень много |

---

Готово. Если что-то непонятно — гугли «Render docs» или спроси.
