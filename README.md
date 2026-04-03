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
- `backend/src/services/agentOrchestrator.js` — слой оркестрации агентов.

## Агенты

1. **🛡 Модератор**
   - rule-based проверка имени файла/типа на NSFW, violence, politics.
2. **⚙️ Кампании**
   - пошаговый сценарий: выбор таргета → подтверждение → загрузка изображения → юридический файл → финализация.
3. **📊 Аналитика**
   - прогноз дней показа и охвата.

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

- Скрипт `backend/src/seed/seedLocations.js` генерирует **100 уникальных локаций** по 10 городам × 10 типам точек (ТЦ, метро, аэропорт и т.д.).

## Основные API

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/chat/session`
- `POST /api/chat/message`
- `POST /api/chat/upload/image`
- `POST /api/chat/upload/legal`
- `GET /api/chat/campaigns`
- `GET /api/chat/dashboard`
- `GET /api/locations?region=Москва` или `?ids=1,2,3`

## Пример диалога

1. Пользователь: `Москва`
2. Агент ⚙️: `Найдено 10 банкоматов в Москва. Продолжить?` + кнопки `Подтвердить/Отменить`
3. Пользователь: `Подтвердить`
4. Агент ⚙️: `Загрузите рекламное изображение`
5. Пользователь загружает `summer-sale.png`
6. Агент 🛡: `Изображение одобрено. Теперь загрузите юридическое согласование.`
7. Пользователь загружает `legal.pdf`
8. Агент ⚙️: `Юридическое согласование получено. Подтвердите финализацию кампании.`
9. Пользователь: `Подтвердить запуск`
10. Агент 📊: `Кампания создана ✅ ...`

## Замена mock AI на реальный

Точка интеграции: `backend/src/services/agentOrchestrator.js` и `backend/src/services/moderationService.js`.

- В текущем MVP логика правил уже изолирована в сервисах.
- Можно заменить на вызовы OpenAI/других LLM/vision API без изменения контрактов роутов.

## Роли

- `user`
- `admin`

> В MVP роль `admin` сохраняется и участвует в JWT, расширения прав можно добавить через middleware `requireRole`.

## Логирование

В таблицу `logs` сохраняются:
- действия пользователя,
- шаги диалога,
- решения агентов,
- timestamp.
