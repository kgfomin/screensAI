import { useEffect, useRef, useState } from 'react';
import { api } from '../services/api';
import MessageBubble from '../components/MessageBubble';

export default function ChatPage() {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [typing, setTyping] = useState(false);
  const imageRef = useRef(null);
  const legalRef = useRef(null);

  async function loadSession() {
    const data = await api('/chat/session');
    setMessages(data.messages || []);
  }

  useEffect(() => {
    loadSession();
  }, []);

  async function sendMessage(custom) {
    const body = custom || text;
    if (!body) return;

    setMessages((prev) => [...prev, { sender: 'user', content: body }]);
    setText('');
    setTyping(true);

    try {
      const reply = await api('/chat/message', {
        method: 'POST',
        body: JSON.stringify({ text: body })
      });

      setMessages((prev) => [...prev, { sender: 'agent', content: reply.content, quickReplies: reply.quickReplies, agent: reply.agent, agent_type: reply.agent?.type }]);
    } finally {
      setTyping(false);
    }
  }

  async function uploadFile(kind, file) {
    const formData = new FormData();
    formData.append('file', file);
    const endpoint = kind === 'image' ? '/chat/upload/image' : '/chat/upload/legal';

    setMessages((prev) => [...prev, { sender: 'user', content: `📎 Загружен файл: ${file.name}` }]);
    setTyping(true);

    try {
      const result = await api(endpoint, { method: 'POST', body: formData });
      const reply = result.reply;
      setMessages((prev) => [...prev, { sender: 'agent', content: reply.content, quickReplies: reply.quickReplies, agent: reply.agent, agent_type: reply.agent?.type }]);
    } catch (err) {
      setMessages((prev) => [...prev, { sender: 'agent', content: `Ошибка загрузки: ${err.message}`, agent_type: 'moderator' }]);
    } finally {
      setTyping(false);
    }
  }

  return (
    <div className="chat-shell">
      <div className="chat-header">Настройка рекламной кампании на банкоматах</div>
      <div className="chat-history">
        {messages.map((m, i) => (
          <MessageBubble key={i} message={m} onQuickReply={sendMessage} />
        ))}
        {typing && <div className="typing">Агент печатает...</div>}
      </div>

      <div className="upload-row">
        <input ref={imageRef} type="file" hidden onChange={(e) => e.target.files?.[0] && uploadFile('image', e.target.files[0])} />
        <input ref={legalRef} type="file" hidden onChange={(e) => e.target.files?.[0] && uploadFile('legal', e.target.files[0])} />
        <button onClick={() => imageRef.current?.click()}>Загрузить изображение</button>
        <button onClick={() => legalRef.current?.click()}>Загрузить согласование</button>
      </div>

      <div className="chat-input">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Введите регион (Москва) или ID (1,2,3)"
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
        />
        <button onClick={() => sendMessage()}>Отправить</button>
      </div>
    </div>
  );
}
