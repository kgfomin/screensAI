import { query } from '../db/client.js';
import { logAction } from './logService.js';

export const AGENTS = {
  moderator: { name: '🛡 Модератор', type: 'moderator' },
  campaign: { name: '⚙️ Кампании', type: 'campaign' },
  analytics: { name: '📊 Аналитика', type: 'analytics' }
};

export const STEPS = {
  selectTarget: 'select_target',
  confirmTarget: 'confirm_target',
  uploadImage: 'upload_image',
  legalApproval: 'legal_approval',
  finalize: 'finalize',
  completed: 'completed'
};

const CONFIRM_WORDS = new Set(['подтвердить', 'подтверждаю', 'ок', 'да', 'подтвердить запуск']);
const CANCEL_WORDS = new Set(['отменить', 'отмена', 'нет']);

function buildAgentMessage(agentKey, content, quickReplies = [], metadata = {}) {
  return {
    sender: 'agent',
    content,
    quickReplies,
    agent: AGENTS[agentKey],
    metadata
  };
}

async function addMessage(sessionId, sender, content, metadata = {}, agentType = null) {
  await query(
    'INSERT INTO messages (session_id, sender, content, metadata, agent_type) VALUES ($1, $2, $3, $4, $5)',
    [sessionId, sender, content, metadata, agentType]
  );
}

async function addAgentMessage(sessionId, message) {
  await addMessage(
    sessionId,
    'agent',
    message.content,
    { ...message.metadata, quickReplies: message.quickReplies },
    message.agent.type
  );
}

async function setSessionStep(sessionId, step) {
  await query('UPDATE chat_sessions SET step=$1, updated_at=NOW() WHERE id=$2', [step, sessionId]);
}

function normalizeText(input) {
  return input.trim().toLowerCase();
}

function isConfirm(text) {
  const normalized = normalizeText(text);
  return CONFIRM_WORDS.has(normalized) || normalized.includes('подтверд');
}

function isCancel(text) {
  const normalized = normalizeText(text);
  return CANCEL_WORDS.has(normalized) || normalized.includes('отмен');
}

function parseIdList(clean) {
  const idPattern = /^\d+(\s*,\s*\d+)*$/;
  if (!idPattern.test(clean)) return null;
  return clean.split(',').map((part) => Number(part.trim()));
}

async function parseNaturalRegionAndCount(input) {
  const normalized = normalizeText(input);
  const countMatch = normalized.match(/(\d+)\s*банкомат/);
  const requestedCount = countMatch ? Number(countMatch[1]) : null;

  const cities = await query('SELECT DISTINCT city FROM locations');
  const matchedCity = cities.rows.map((row) => row.city).find((city) => normalized.includes(city.toLowerCase()));

  if (!matchedCity) return null;
  return { city: matchedCity, requestedCount };
}

async function parseTargetInput(input) {
  const clean = input.trim();

  const ids = parseIdList(clean);
  if (ids) {
    return {
      targetType: 'ids',
      raw: clean,
      ids,
      requestedCount: null
    };
  }

  const natural = await parseNaturalRegionAndCount(clean);
  if (natural) {
    return {
      targetType: 'region',
      raw: natural.city,
      region: natural.city,
      requestedCount: natural.requestedCount
    };
  }

  if (/^[а-яa-z\-\s]+$/i.test(clean) && clean.length >= 2) {
    return {
      targetType: 'region',
      raw: clean,
      region: clean,
      requestedCount: null
    };
  }

  return null;
}

async function resolveTarget(parsedTarget) {
  if (!parsedTarget) return [];

  if (parsedTarget.targetType === 'ids') {
    const result = await query('SELECT * FROM locations WHERE id = ANY($1) ORDER BY id', [parsedTarget.ids]);
    return result.rows;
  }

  const result = await query('SELECT * FROM locations WHERE LOWER(city)=LOWER($1) ORDER BY id', [parsedTarget.region]);
  const locations = result.rows;

  if (parsedTarget.requestedCount && parsedTarget.requestedCount > 0) {
    return locations.slice(0, parsedTarget.requestedCount);
  }

  return locations;
}

function buildForecast(atmCount) {
  const forecastDays = Math.max(3, Math.min(14, Math.ceil(atmCount / 8)));
  const forecastReach = atmCount * 1200;
  return { forecastDays, forecastReach };
}

async function persistTargetSelection(session, parsedTarget, locations) {
  await query(
    'UPDATE campaigns SET target_type=$1, target_value=$2, atm_count=$3, updated_at=NOW() WHERE id=$4',
    [parsedTarget.targetType, parsedTarget.raw, locations.length, session.campaign_id]
  );

  await query('DELETE FROM campaign_atms WHERE campaign_id=$1', [session.campaign_id]);
  for (const location of locations) {
    await query('INSERT INTO campaign_atms (campaign_id, location_id) VALUES ($1, $2)', [
      session.campaign_id,
      location.id
    ]);
  }
}

function getTargetLabel(parsedTarget) {
  return parsedTarget.targetType === 'region' ? parsedTarget.raw : 'выбранному списку ID';
}

export async function getOrCreateSession(userId) {
  const found = await query('SELECT * FROM chat_sessions WHERE user_id=$1 ORDER BY id DESC LIMIT 1', [userId]);
  if (found.rows[0] && found.rows[0].step !== STEPS.completed) return found.rows[0];

  const campaignResult = await query(
    "INSERT INTO campaigns (user_id, status) VALUES ($1, 'draft') RETURNING *",
    [userId]
  );
  const sessionResult = await query(
    'INSERT INTO chat_sessions (user_id, campaign_id, step) VALUES ($1, $2, $3) RETURNING *',
    [userId, campaignResult.rows[0].id, STEPS.selectTarget]
  );

  return sessionResult.rows[0];
}

export async function fetchMessages(sessionId) {
  const result = await query('SELECT * FROM messages WHERE session_id=$1 ORDER BY id ASC', [sessionId]);
  return result.rows;
}

export async function ensureWelcomeMessage(userId) {
  const session = await getOrCreateSession(userId);
  const existingMessages = await fetchMessages(session.id);

  if (existingMessages.length > 0) return { session, created: false };

  const welcome = buildAgentMessage(
    'campaign',
    'Привет! Укажите регион (например, Москва), список ID (например, 1,2,3) или фразу «Запусти кампанию на 5 банкоматах в Москве».',
    ['Выбрать Москву']
  );

  await addAgentMessage(session.id, welcome);
  await logAction(userId, 'dialog_started', { campaignId: session.campaign_id });
  return { session, created: true };
}

async function handleSelectTarget(session, userId, text) {
  const parsedTarget = await parseTargetInput(text);
  const locations = await resolveTarget(parsedTarget);

  if (!parsedTarget || locations.length === 0) {
    const notFoundMessage = buildAgentMessage(
      'campaign',
      'Не удалось найти банкоматы. Введите регион (Москва), ID (1,2,3) или фразу «на 5 банкоматах в Москве».',
      ['Выбрать Москву', 'Отменить']
    );
    await addAgentMessage(session.id, notFoundMessage);
    return notFoundMessage;
  }

  await persistTargetSelection(session, parsedTarget, locations);
  await setSessionStep(session.id, STEPS.confirmTarget);
  await logAction(userId, 'target_selected', {
    campaignId: session.campaign_id,
    targetType: parsedTarget.targetType,
    targetValue: parsedTarget.raw,
    atmCount: locations.length
  });

  const response = buildAgentMessage(
    'campaign',
    `Найдено ${locations.length} банкоматов в ${getTargetLabel(parsedTarget)}. Продолжить?`,
    ['Подтвердить', 'Отменить']
  );
  await addAgentMessage(session.id, response);
  return response;
}

async function handleConfirmTarget(session, userId, text) {
  if (isCancel(text)) {
    await setSessionStep(session.id, STEPS.selectTarget);
    const response = buildAgentMessage(
      'campaign',
      'Выбор устройств отменён. Укажите регион или список ID заново.',
      ['Выбрать Москву']
    );
    await addAgentMessage(session.id, response);
    return response;
  }

  if (isConfirm(text)) {
    await setSessionStep(session.id, STEPS.uploadImage);
    const response = buildAgentMessage(
      'campaign',
      'Отлично. Теперь загрузите рекламное изображение для проверки модератором.',
      ['Загрузить изображение']
    );
    await addAgentMessage(session.id, response);
    return response;
  }

  const reparsedTarget = await parseTargetInput(text);
  if (reparsedTarget) {
    return handleSelectTarget(session, userId, text);
  }

  const fallback = buildAgentMessage(
    'campaign',
    'Нужна команда «Подтвердить» или «Отменить». Либо отправьте новый регион/ID, и я обновлю выбор.',
    ['Подтвердить', 'Отменить', 'Выбрать Москву']
  );
  await addAgentMessage(session.id, fallback);
  return fallback;
}

async function handleFinalize(session, userId, text) {
  if (!isConfirm(text)) {
    const response = buildAgentMessage(
      'campaign',
      'Для запуска кампании нажмите «Подтвердить запуск» или «Отменить».',
      ['Подтвердить запуск', 'Отменить']
    );
    await addAgentMessage(session.id, response);
    return response;
  }

  const campaignResult = await query('SELECT * FROM campaigns WHERE id=$1', [session.campaign_id]);
  const campaign = campaignResult.rows[0];
  const forecast = buildForecast(campaign.atm_count);

  await query(
    "UPDATE campaigns SET status='active', forecast_days=$1, forecast_reach=$2, updated_at=NOW() WHERE id=$3",
    [forecast.forecastDays, forecast.forecastReach, session.campaign_id]
  );

  await setSessionStep(session.id, STEPS.completed);
  await logAction(userId, 'campaign_activated', {
    campaignId: session.campaign_id,
    atmCount: campaign.atm_count,
    forecastDays: forecast.forecastDays,
    forecastReach: forecast.forecastReach
  });

  const response = buildAgentMessage(
    'analytics',
    `Кампания создана ✅\nКоличество устройств: ${campaign.atm_count}\nПрогноз времени показа: ${forecast.forecastDays} дней\nПример охвата: ~${forecast.forecastReach.toLocaleString('ru-RU')} контактов`,
    ['Создать новую кампанию']
  );
  await addAgentMessage(session.id, response);
  return response;
}

export async function handleUserMessage(userId, text) {
  const session = await getOrCreateSession(userId);
  const input = text.trim();
  await addMessage(session.id, 'user', input);

  if (input.toLowerCase() === 'создать новую кампанию') {
    await setSessionStep(session.id, STEPS.selectTarget);
    const response = buildAgentMessage(
      'campaign',
      'Начинаем новую кампанию. Введите регион/ID или «на 5 банкоматах в Москве».',
      ['Выбрать Москву']
    );
    await addAgentMessage(session.id, response);
    return response;
  }

  if (session.step === STEPS.selectTarget) {
    const normalized = input.toLowerCase() === 'выбрать москву' ? 'Москва' : input;
    return handleSelectTarget(session, userId, normalized);
  }

  if (session.step === STEPS.confirmTarget) {
    return handleConfirmTarget(session, userId, input);
  }

  if (session.step === STEPS.uploadImage) {
    const response = buildAgentMessage(
      'moderator',
      'Сейчас жду файл изображения. Нажмите кнопку «Загрузить изображение».',
      ['Загрузить изображение']
    );
    await addAgentMessage(session.id, response);
    return response;
  }

  if (session.step === STEPS.legalApproval) {
    const response = buildAgentMessage(
      'campaign',
      'Сейчас жду файл юридического согласования (PDF/изображение).',
      ['Загрузить согласование']
    );
    await addAgentMessage(session.id, response);
    return response;
  }

  if (session.step === STEPS.finalize) {
    if (isCancel(input)) {
      await query("UPDATE campaigns SET status='completed', updated_at=NOW() WHERE id=$1", [session.campaign_id]);
      await setSessionStep(session.id, STEPS.completed);
      const response = buildAgentMessage('campaign', 'Запуск отменён. Кампания завершена без активации.');
      await addAgentMessage(session.id, response);
      return response;
    }

    return handleFinalize(session, userId, input);
  }

  const response = buildAgentMessage(
    'campaign',
    'Текущая сессия завершена. Нажмите «Создать новую кампанию» для нового сценария.',
    ['Создать новую кампанию']
  );
  await addAgentMessage(session.id, response);
  return response;
}

export async function onImageModerated(userId, approved, reason, filePath, violations = []) {
  const session = await getOrCreateSession(userId);

  if (session.step !== STEPS.uploadImage) {
    return buildAgentMessage('campaign', 'Сейчас загрузка изображения не ожидается.');
  }

  if (!approved) {
    await logAction(userId, 'image_rejected', {
      campaignId: session.campaign_id,
      reason,
      violations
    });

    const rejection = buildAgentMessage('moderator', reason, ['Загрузить другое изображение']);
    await addAgentMessage(session.id, rejection);
    return rejection;
  }

  await query('UPDATE campaigns SET image_path=$1, updated_at=NOW() WHERE id=$2', [filePath, session.campaign_id]);
  await setSessionStep(session.id, STEPS.legalApproval);
  await logAction(userId, 'image_approved', { campaignId: session.campaign_id, filePath });

  const response = buildAgentMessage(
    'moderator',
    'Изображение проверено: нарушений не найдено. Загрузите юридическое согласование.',
    ['Загрузить согласование']
  );
  await addAgentMessage(session.id, response);
  return response;
}

export async function onLegalUploaded(userId, filePath) {
  const session = await getOrCreateSession(userId);

  if (session.step !== STEPS.legalApproval) {
    return buildAgentMessage('campaign', 'Сейчас юридическое согласование не ожидается.');
  }

  await query(
    'UPDATE campaigns SET legal_file_path=$1, legal_approved=true, updated_at=NOW() WHERE id=$2',
    [filePath, session.campaign_id]
  );
  await setSessionStep(session.id, STEPS.finalize);
  await logAction(userId, 'legal_uploaded', { campaignId: session.campaign_id, filePath });

  const response = buildAgentMessage(
    'campaign',
    'Юридическое согласование получено. Подтвердите запуск кампании.',
    ['Подтвердить запуск', 'Отменить']
  );
  await addAgentMessage(session.id, response);
  return response;
}
