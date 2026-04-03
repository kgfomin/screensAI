const agentNames = {
  moderator: '🛡 Модератор',
  campaign: '⚙️ Кампании',
  analytics: '📊 Аналитика'
};

export default function MessageBubble({ message, onQuickReply }) {
  const isUser = message.sender === 'user';
  const quickReplies = message.quickReplies || message.metadata?.quickReplies || [];

  return (
    <div className={`msg-row ${isUser ? 'user' : 'agent'}`}>
      <div className="msg-bubble">
        {!isUser && <div className="agent-name">{agentNames[message.agent_type] || message.agent?.name || '🤖 Агент'}</div>}
        <div style={{ whiteSpace: 'pre-line' }}>{message.content}</div>
        {quickReplies.length > 0 && (
          <div className="quick-replies">
            {quickReplies.map((reply) => (
              <button key={reply} onClick={() => onQuickReply(reply)}>
                {reply}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
