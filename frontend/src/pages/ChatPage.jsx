import { useEffect, useRef, useState } from 'react';
import { api } from '../services/api';
import MessageBubble from '../components/MessageBubble';

export default function ChatPage() {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [typing, setTyping] = useState(false);
  const [loading, setLoading] = useState(true);
  const imageRef = useRef(null);
  const legalRef = useRef(null);
  const historyRef = useRef(null);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await api('/chat/session');
        setMessages(data.messages || []);
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
    } catch (error) {
      setMessages((prev) => [...prev, { sender: 'agent', content: `Ошибка загрузки: ${error.message}`, agent_type: 'moderator' }]);
    } finally {
      setTyping(false);
    }
  }

  if (loading) return <div className="chat-loading">Загрузка диалога...</div>;

  return (
    <div className="chat-shell">
      <div className="chat-header">Чат настройки рекламной кампании на банкоматах</div>

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

        <button onClick={() => imageRef.current?.click()}>Загрузить изображение</button>
        <button onClick={() => legalRef.current?.click()}>Загрузить согласование</button>
      </div>

      <div className="chat-input">
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Например: Москва или 1,2,3"
          onKeyDown={(event) => event.key === 'Enter' && sendMessage()}
        />
        <button onClick={() => sendMessage()}>Отправить</button>
      </div>
    </div>
  );
}
