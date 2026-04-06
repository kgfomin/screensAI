import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../services/api';
import MessageBubble from '../components/MessageBubble';

const STEP_LABELS = {
  select_target: 'Шаг 1/5 — Выбор региона или ID банкоматов',
  confirm_target: 'Шаг 2/5 — Подтверждение количества банкоматов',
  upload_image: 'Шаг 3/5 — Загрузка рекламного изображения',
  legal_approval: 'Шаг 4/5 — Загрузка юридического согласования',
  finalize: 'Шаг 5/5 — Финальный запуск кампании',
  completed: 'Кампания завершена'
};

const STEP_HINTS = {
  select_target: ['Москва', '1,2,3', 'Запусти кампанию на 5 банкоматах в Москве'],
  confirm_target: ['Подтвердить', 'Отменить'],
  upload_image: ['Загрузить изображение'],
  legal_approval: ['Загрузить согласование'],
  finalize: ['Подтвердить запуск', 'Отменить'],
  completed: ['Создать новую кампанию']
};

export default function ChatPage() {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [typing, setTyping] = useState(false);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState('select_target');
  const imageRef = useRef(null);
  const legalRef = useRef(null);
  const historyRef = useRef(null);

  const canUploadImage = step === 'upload_image';
  const canUploadLegal = step === 'legal_approval';

  async function loadSession() {
    const data = await api('/chat/session');
    setMessages(data.messages || []);
    setStep(data.session?.step || 'select_target');
  }

  useEffect(() => {
    const load = async () => {
      try {
        await loadSession();
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  useEffect(() => {
    historyRef.current?.scrollTo({ top: historyRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, typing]);

  async function sendMessage(customText) {
    const body = (customText || text).trim();
    if (!body) return;

    setMessages((prev) => [...prev, { sender: 'user', content: body }]);
    setText('');
    setTyping(true);

    try {
      const reply = await api('/chat/message', {
        method: 'POST',
        body: JSON.stringify({ text: body })
      });

      setMessages((prev) => [
        ...prev,
        {
          sender: 'agent',
          content: reply.content,
          quickReplies: reply.quickReplies,
          agent: reply.agent,
          agent_type: reply.agent?.type
        }
      ]);
      if (reply.step) setStep(reply.step);
    } catch (error) {
      setMessages((prev) => [...prev, { sender: 'agent', content: `Ошибка: ${error.message}`, agent_type: 'campaign' }]);
    } finally {
      setTyping(false);
    }
  }

  async function uploadFile(kind, file) {
    const formData = new FormData();
    formData.append('file', file);

    setMessages((prev) => [...prev, { sender: 'user', content: `📎 Загружен файл: ${file.name}` }]);
    setTyping(true);

    try {
      const endpoint = kind === 'image' ? '/chat/upload/image' : '/chat/upload/legal';
      const response = await api(endpoint, { method: 'POST', body: formData });

      setMessages((prev) => [
        ...prev,
        {
          sender: 'agent',
          content: response.reply.content,
          quickReplies: response.reply.quickReplies,
          agent: response.reply.agent,
          agent_type: response.reply.agent?.type
        }
      ]);
      if (response.step) setStep(response.step);
    } catch (error) {
      setMessages((prev) => [...prev, { sender: 'agent', content: `Ошибка загрузки: ${error.message}`, agent_type: 'moderator' }]);
    } finally {
      setTyping(false);
    }
  }

  const hintActions = useMemo(() => STEP_HINTS[step] || [], [step]);

  if (loading) return <div className="chat-loading">Загрузка диалога...</div>;

  return (
    <div className="chat-shell">
      <div className="chat-header">Чат настройки рекламной кампании на банкоматах</div>

      <div className="step-banner">
        <strong>{STEP_LABELS[step] || STEP_LABELS.select_target}</strong>
        <div className="step-actions">
          {hintActions.map((action) => (
            <button key={action} onClick={() => sendMessage(action)}>
              {action}
            </button>
          ))}
        </div>
      </div>

      <div ref={historyRef} className="chat-history">
        {messages.map((message, index) => (
          <MessageBubble key={index} message={message} onQuickReply={sendMessage} />
        ))}
        {typing && <div className="typing">Агент печатает...</div>}
      </div>

      <div className="upload-row">
        <input
          ref={imageRef}
          type="file"
          hidden
          accept="image/*"
          onChange={(event) => event.target.files?.[0] && uploadFile('image', event.target.files[0])}
        />
        <input
          ref={legalRef}
          type="file"
          hidden
          accept=".pdf,image/*"
          onChange={(event) => event.target.files?.[0] && uploadFile('legal', event.target.files[0])}
        />

        <button disabled={!canUploadImage} onClick={() => imageRef.current?.click()}>
          Загрузить изображение
        </button>
        <button disabled={!canUploadLegal} onClick={() => legalRef.current?.click()}>
          Загрузить согласование
        </button>
      </div>

      <div className="chat-input">
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Например: Москва, 1,2,3 или «на 5 банкоматах в Москве»"
          onKeyDown={(event) => event.key === 'Enter' && sendMessage()}
        />
        <button onClick={() => sendMessage()}>Отправить</button>
      </div>
    </div>
  );
}
