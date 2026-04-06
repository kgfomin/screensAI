import { query } from '../db/client.js';
import { logAction } from './logService.js';

const AGENTS = {
  moderator: { name: '🛡 Модератор', type: 'moderator' },
  campaign: { name: '⚙️ Кампании', type: 'campaign' },
  analytics: { name: '📊 Аналитика', type: 'analytics' }
};

function msg(agent, content, quickReplies = []) {
  return {
    sender: 'agent',
    agent: AGENTS[agent],
    content,
    quickReplies
  };
}

export async function getOrCreateSession(userId) {
  const found = await query(
    'SELECT * FROM chat_sessions WHERE user_id=$1 ORDER BY id DESC LIMIT 1',
    [userId]
  );

  if (found.rows[0] && found.rows[0].step !== 'completed') {
    return found.rows[0];
  }

  const campaign = await query(
    `INSERT INTO campaigns (user_id, status) VALUES ($1, 'draft') RETURNING *`,
    [userId]
  );
  const session = await query(
    'INSERT INTO chat_sessions (user_id, campaign_id, step) VALUES ($1, $2, $3) RETURNING *',
    [userId, campaign.rows[0].id, 'select_target']
  );

  return session.rows[0];
}

export async function addMessage(sessionId, sender, content, metadata = {}, agentType = null) {
  await query(
    'INSERT INTO messages (session_id, sender, content, metadata, agent_type) VALUES ($1, $2, $3, $4, $5)',
    [sessionId, sender, content, metadata, agentType]
  );
}

async function updateSession(sessionId, step) {
  await query('UPDATE chat_sessions SET step=$1, updated_at=NOW() WHERE id=$2', [step, sessionId]);
}

export async function fetchMessages(sessionId) {
  const result = await query('SELECT * FROM messages WHERE session_id=$1 ORDER BY id', [sessionId]);
  return result.rows;
}

async function resolveTarget(input) {
  const clean = input.trim();
  if (/^\d+(\s*,\s*\d+)*$/.test(clean)) {
    const ids = clean.split(',').map((x) => Number(x.trim()));
    const data = await query('SELECT * FROM locations WHERE id = ANY($1)', [ids]);
    return { targetType: 'ids', targetValue: clean, locations: data.rows };
  }

  const data = await query('SELECT * FROM locations WHERE LOWER(city)=LOWER($1)', [clean]);
  return { targetType: 'region', targetValue: clean, locations: data.rows };
}

function buildForecast(count) {
  const days = Math.max(3, Math.min(14, Math.ceil(count / 8)));
  const reach = count * 1150;
  return { days, reach };
}

export async function handleUserMessage(userId, inputText) {
  const session = await getOrCreateSession(userId);
  await addMessage(session.id, 'user', inputText);

  const sessionReloaded = await query('SELECT * FROM chat_sessions WHERE id=$1', [session.id]);
  const current = sessionReloaded.rows[0];

  if (current.step === 'select_target') {
    const target = await resolveTarget(inputText);
    if (target.locations.length === 0) {
      const response = msg('campaign', 'Не удалось найти банкоматы. Введите регион (например, Москва) или список ID через запятую.', ['Выбрать Москву']);
      await addMessage(current.id, 'agent', response.content, { quickReplies: response.quickReplies }, response.agent.type);
      return response;
    }

    await query(
      'UPDATE campaigns SET target_type=$1, target_value=$2, atm_count=$3, updated_at=NOW() WHERE id=$4',
      [target.targetType, target.targetValue, target.locations.length, current.campaign_id]
    );

    await query('DELETE FROM campaign_atms WHERE campaign_id=$1', [current.campaign_id]);
    for (const location of target.locations) {
      await query('INSERT INTO campaign_atms (campaign_id, location_id) VALUES ($1, $2)', [
        current.campaign_id,
        location.id
      ]);
    }

    await updateSession(current.id, 'confirm_target');
    await logAction(userId, 'target_selected', { campaignId: current.campaign_id, count: target.locations.length });

    const response = msg(
      'campaign',
      `Найдено ${target.locations.length} банкоматов в ${target.targetType === 'region' ? target.targetValue : 'выбранном списке'}. Продолжить?`,
      ['Подтвердить', 'Отменить']
    );
    await addMessage(current.id, 'agent', response.content, { quickReplies: response.quickReplies }, response.agent.type);
    return response;
  }

  if (current.step === 'confirm_target') {
    if (inputText.toLowerCase().includes('подтверд')) {
      await updateSession(current.id, 'upload_image');
      const response = msg('campaign', 'Отлично! Загрузите рекламное изображение.', ['Загрузить изображение']);
      await addMessage(current.id, 'agent', response.content, { quickReplies: response.quickReplies }, response.agent.type);
      return response;
    }

    await updateSession(current.id, 'select_target');
    const response = msg('campaign', 'Выбор отменён. Укажите регион или список ID банкоматов заново.');
    await addMessage(current.id, 'agent', response.content, {}, response.agent.type);
    return response;
  }

  if (current.step === 'upload_image') {
    const response = msg('moderator', 'Пожалуйста, прикрепите изображение через кнопку загрузки.', ['Загрузить изображение']);
    await addMessage(current.id, 'agent', response.content, { quickReplies: response.quickReplies }, response.agent.type);
    return response;
  }

  if (current.step === 'legal_approval') {
    const response = msg('campaign', 'Загрузите файл юридического согласования (PDF/изображение).', ['Загрузить согласование']);
    await addMessage(current.id, 'agent', response.content, { quickReplies: response.quickReplies }, response.agent.type);
    return response;
  }

  if (current.step === 'finalize') {
    const campaignResult = await query('SELECT * FROM campaigns WHERE id=$1', [current.campaign_id]);
    const campaign = campaignResult.rows[0];
    const forecast = buildForecast(campaign.atm_count);

    await query(
      `UPDATE campaigns SET status='active', forecast_days=$1, forecast_reach=$2, updated_at=NOW() WHERE id=$3`,
      [forecast.days, forecast.reach, current.campaign_id]
    );
    await updateSession(current.id, 'completed');
    await logAction(userId, 'campaign_finalized', { campaignId: current.campaign_id, forecast });

    const response = msg(
      'analytics',
      `Кампания создана ✅\nУстройств: ${campaign.atm_count}\nПрогноз показа: ${forecast.days} дней\nОхват: ~${forecast.reach.toLocaleString('ru-RU')} контактов`,
      ['Создать новую кампанию']
    );
    await addMessage(current.id, 'agent', response.content, { quickReplies: response.quickReplies }, response.agent.type);
    return response;
  }

  const response = msg('campaign', 'Кампания завершена. Нажмите «Создать новую кампанию» или отправьте новое сообщение.');
  await addMessage(current.id, 'agent', response.content, {}, response.agent.type);
  return response;
}

export async function onImageModerated(userId, approved, reason, filePath) {
  const session = await getOrCreateSession(userId);
  const stepAllowed = ['upload_image'];

  if (!stepAllowed.includes(session.step)) {
    return msg('campaign', 'Сейчас загрузка изображения не ожидается.');
  }

  if (!approved) {
    await logAction(userId, 'image_rejected', { reason });
    await addMessage(session.id, 'agent', reason, { quickReplies: ['Загрузить другое изображение'] }, AGENTS.moderator.type);
    return msg('moderator', reason, ['Загрузить другое изображение']);
  }

  await query('UPDATE campaigns SET image_path=$1, updated_at=NOW() WHERE id=$2', [filePath, session.campaign_id]);
  await updateSession(session.id, 'legal_approval');
  await logAction(userId, 'image_approved', { campaignId: session.campaign_id, filePath });

  const response = msg('moderator', 'Изображение одобрено. Теперь загрузите юридическое согласование.', ['Загрузить согласование']);
  await addMessage(session.id, 'agent', response.content, { quickReplies: response.quickReplies }, response.agent.type);
  return response;
}

export async function onLegalUploaded(userId, filePath) {
  const session = await getOrCreateSession(userId);
  await query(
    'UPDATE campaigns SET legal_file_path=$1, legal_approved=true, updated_at=NOW() WHERE id=$2',
    [filePath, session.campaign_id]
  );
  await updateSession(session.id, 'finalize');
  await logAction(userId, 'legal_uploaded', { campaignId: session.campaign_id, filePath });

  const response = msg('campaign', 'Юридическое согласование получено. Подтвердите финализацию кампании.', ['Подтвердить запуск']);
  await addMessage(session.id, 'agent', response.content, { quickReplies: response.quickReplies }, response.agent.type);
  return response;
}
