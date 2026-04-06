# ATM Ads AI Chat Platform (MVP)

Полнофункциональный MVP web-приложения (frontend + backend), имитирующего настройку рекламных баннеров на банкоматах через чат с ИИ-агентами.

## Стек

- **Frontend:** React + Vite
- **Backend:** Node.js + Express
- **БД:** PostgreSQL
- **Auth:** JWT
- **Файлы:** локальное хранение (`backend/uploads`)
- **AI:** mock-оркестрация на правилах (можно заменить реальным AI API)

## Архитектура

- `frontend/` — чат UI, quick replies, загрузка файлов, dashboard.
- `backend/` — API, auth, agent orchestration, moderation, logging.
- `backend/src/services/agentOrchestrator.js` — orchestration layer со step-based сценарием и агентами.

## ИИ-агенты

1. **🛡 Модератор**
   - Проверка изображения на запрещённый контент (NSFW, violence, politics) rule-based логикой.
2. **⚙️ Создатель кампаний**
   - Шаг 1: выбор региона или списка ATM ID;
   - Шаг 2: подтверждение количества;
   - Шаг 3: загрузка изображения;
   - Шаг 4: загрузка юридического согласования;
   - Шаг 5: подтверждение запуска кампании.
3. **📊 Аналитик**
   - После запуска отдаёт прогноз длительности и пример охвата.

## Быстрый запуск

### 1) Поднять PostgreSQL

```bash
docker compose up -d
```

### 2) Запустить backend

```bash
cd backend
cp .env.example .env
npm install
npm run seed
npm run dev
```

### 3) Запустить frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend: `http://localhost:5173`  
Backend: `http://localhost:4000`

## Seed-данные

- `backend/src/seed/seedLocations.js` создаёт **100 уникальных локаций**.
- Пример JSON с 100 локациями: `backend/src/seed/locations.sample.json`.

## Основные API

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/chat/session` — получить текущую сессию и историю (с автоприветствием)
- `POST /api/chat/message` — отправка сообщения в агентный диалог
- `POST /api/chat/upload/image` — загрузка рекламного изображения
- `POST /api/chat/upload/legal` — загрузка юридического согласования
- `GET /api/chat/campaigns` — список кампаний пользователя
- `GET /api/chat/dashboard` — агрегированная аналитика
- `GET /api/locations?region=Москва` или `GET /api/locations?ids=1,2,3`

## UX/чат

Реализовано:
- чат в стиле мессенджера;
- сообщения пользователя справа, агентов слева;
- разные подписи агентов (🛡/⚙️/📊);
- индикатор «Агент печатает...»;
- quick replies: `Выбрать Москву`, `Подтвердить`, `Отменить`, `Загрузить изображение` и др.;
- загрузка файлов прямо в чат.

## Пример диалога

1. Пользователь: `Москва` (или `Запусти кампанию на 5 банкоматах в Москве`)
2. Агент ⚙️: `Найдено 10 банкоматов по Москва. Продолжить?` + `Подтвердить/Отменить`
3. Пользователь: `Подтвердить`
4. Агент ⚙️: `Загрузите рекламное изображение...`
5. Пользователь загружает `summer-sale.png`
6. Агент 🛡: `Изображение проверено... Загрузите юридическое согласование.`
7. Пользователь загружает `legal.pdf`
8. Агент ⚙️: `Подтвердите запуск кампании.`
9. Пользователь: `Подтвердить запуск`
10. Агент 📊: `Кампания создана ✅ ...`

## Логирование

Таблица `logs` хранит:
- действия пользователя,
- шаги диалога,
- решения агентов,
- timestamp.

## Замена mock AI на реальный AI API

Основные точки расширения:
- `backend/src/services/agentOrchestrator.js`
- `backend/src/services/moderationService.js`

Внешние API можно подключить без изменения контрактов frontend/backend роутов.
