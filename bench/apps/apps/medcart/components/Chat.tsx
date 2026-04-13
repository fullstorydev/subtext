import { ChatThread, Page } from "../types";

interface Props {
  threads: ChatThread[];
  selectedThreadId?: string;
  onNavigate: (page: Page) => void;
}

export function Chat({ threads, selectedThreadId, onNavigate }: Props) {
  const selected = selectedThreadId
    ? threads.find((t) => t.id === selectedThreadId)
    : null;

  return (
    <div className="chat">
      <h1>Support Chat</h1>

      <div className="chat-layout">
        <div className="thread-list">
          {threads.map((thread) => (
            <button
              key={thread.id}
              className={`thread-item ${thread.id === selectedThreadId ? "active" : ""}`}
              onClick={() => onNavigate({ type: "chat", threadId: thread.id })}
            >
              <div className="thread-subject">{thread.subject}</div>
              <div className="thread-status">
                <span
                  className={`status-dot ${thread.status === "open" ? "open" : "resolved"}`}
                />
                {thread.status}
              </div>
              <div className="thread-preview">
                {thread.messages[thread.messages.length - 1].content.slice(
                  0,
                  60,
                )}
                ...
              </div>
            </button>
          ))}
        </div>

        <div className="thread-detail">
          {selected ? (
            <>
              <div className="thread-header">
                <h2>{selected.subject}</h2>
                <span
                  className={`status-badge ${selected.status === "open" ? "badge-open" : "badge-resolved"}`}
                >
                  {selected.status}
                </span>
              </div>
              <div className="messages">
                {selected.messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`message ${msg.sender === "patient" ? "msg-patient" : "msg-agent"}`}
                  >
                    <div className="msg-header">
                      <span className="msg-sender">{msg.senderName}</span>
                      <span className="msg-time">
                        {new Date(msg.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <div className="msg-content">{msg.content}</div>
                  </div>
                ))}
              </div>
              <div className="reply-box">
                <textarea placeholder="Type your message..." rows={3} />
                <button className="btn-primary">Send</button>
              </div>
            </>
          ) : (
            <div className="no-selection">
              Select a conversation to view messages
            </div>
          )}
        </div>
      </div>

      <style>{`
        .chat h1 { font-size: 1.5rem; margin-bottom: 24px; }
        .chat-layout {
          display: grid;
          grid-template-columns: 300px 1fr;
          gap: 0;
          background: #fff;
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          overflow: hidden;
          min-height: 500px;
        }
        .thread-list {
          border-right: 1px solid #e0e0e0;
          overflow-y: auto;
        }
        .thread-item {
          display: block;
          width: 100%;
          padding: 16px;
          border: none;
          border-bottom: 1px solid #f0f0f0;
          background: none;
          text-align: left;
          cursor: pointer;
          font-family: inherit;
        }
        .thread-item:hover { background: #f5f5f5; }
        .thread-item.active { background: #e3f2fd; }
        .thread-subject { font-weight: 600; font-size: 0.9rem; }
        .thread-status {
          font-size: 0.75rem;
          color: #666;
          margin-top: 4px;
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          display: inline-block;
        }
        .status-dot.open { background: #4caf50; }
        .status-dot.resolved { background: #9e9e9e; }
        .thread-preview {
          font-size: 0.8rem;
          color: #888;
          margin-top: 4px;
        }
        .thread-detail { padding: 20px; display: flex; flex-direction: column; }
        .thread-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
          padding-bottom: 12px;
          border-bottom: 1px solid #e0e0e0;
        }
        .thread-header h2 { font-size: 1.1rem; margin: 0; }
        .status-badge {
          padding: 4px 12px;
          border-radius: 12px;
          font-size: 0.75rem;
          font-weight: 500;
        }
        .badge-open { background: #e8f5e9; color: #2e7d32; }
        .badge-resolved { background: #eeeeee; color: #616161; }
        .messages {
          flex: 1;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-bottom: 16px;
        }
        .message {
          padding: 12px;
          border-radius: 8px;
          max-width: 85%;
        }
        .msg-patient {
          background: #e3f2fd;
          align-self: flex-end;
        }
        .msg-agent {
          background: #f5f5f5;
          align-self: flex-start;
        }
        .msg-header {
          display: flex;
          justify-content: space-between;
          margin-bottom: 6px;
          font-size: 0.8rem;
        }
        .msg-sender { font-weight: 600; }
        .msg-time { color: #888; }
        .msg-content { font-size: 0.9rem; line-height: 1.5; }
        .reply-box {
          display: flex;
          gap: 8px;
          align-items: flex-end;
        }
        .reply-box textarea {
          flex: 1;
          padding: 10px;
          border: 1px solid #ddd;
          border-radius: 6px;
          font-size: 0.9rem;
          font-family: inherit;
          resize: none;
        }
        .btn-primary {
          padding: 10px 24px;
          background: #1976d2;
          color: #fff;
          border: none;
          border-radius: 6px;
          font-size: 0.9rem;
          cursor: pointer;
          font-family: inherit;
        }
        .no-selection {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: #999;
        }
      `}</style>
    </div>
  );
}
