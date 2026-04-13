import { useState } from "preact/hooks";
import { Message, Contract, Freelancer, User } from "../types";

interface Props {
  messages: Message[];
  contracts: Contract[];
  freelancers: Freelancer[];
  currentUser: User;
  selectedFreelancerId?: string;
  onViewContract: (contractId: string) => void;
}

export function Messages({
  messages,
  contracts,
  freelancers,
  currentUser,
  selectedFreelancerId,
  onViewContract,
}: Props) {
  const [expandedSections, setExpandedSections] = useState<
    Record<string, boolean>
  >({
    status: true,
    search: false,
    people: false,
    filesAndLinks: false,
    personalNotepad: false,
  });

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };
  const conversations = freelancers
    .map((freelancer) => {
      const freelancerMessages = messages.filter(
        (m) => m.senderId === freelancer.id || m.recipientId === freelancer.id,
      );
      const lastMessage = freelancerMessages[freelancerMessages.length - 1];
      const contract = contracts.find((c) => c.freelancerId === freelancer.id);

      return {
        freelancer,
        lastMessage,
        contract,
        messages: freelancerMessages,
      };
    })
    .filter((c) => c.lastMessage);

  const selectedConversation = conversations.find(
    (c) => c.freelancer.id === selectedFreelancerId,
  );

  return (
    <div className="messages">
      <div className="messages-container">
        <aside className="conversations-sidebar">
          <div className="sidebar-header">
            <h2>Messages</h2>
            <input type="search" placeholder="Search messages..." />
          </div>

          <div className="conversations-list">
            {conversations.map((conv) => (
              <div
                key={conv.freelancer.id}
                className={`conversation-item ${conv.freelancer.id === selectedFreelancerId ? "active" : ""}`}
              >
                <div className="avatar">{conv.freelancer.name.charAt(0)}</div>
                <div className="conversation-info">
                  <h4>{conv.freelancer.name}</h4>
                  <p className="last-message">{conv.lastMessage?.content}</p>
                </div>
              </div>
            ))}
          </div>
        </aside>

        <main className="chat-area">
          {selectedConversation ? (
            <>
              <div className="chat-header">
                <div className="chat-header-info">
                  <h3>{selectedConversation.freelancer.name}</h3>
                  <p>{selectedConversation.freelancer.title}</p>
                </div>
              </div>

              <div className="messages-list">
                {selectedConversation.messages.map((message) => (
                  <div
                    key={message.id}
                    className={`message ${message.senderId === currentUser.id ? "sent" : "received"}`}
                  >
                    <div className="message-content">
                      <p>{message.content}</p>
                      {message.contractId && (
                        <div className="contract-notice">
                          <div className="contract-info">
                            <strong>Contract offer sent</strong>
                            <p>{selectedConversation.contract?.title}</p>
                          </div>
                          <button
                            onClick={() => onViewContract(message.contractId!)}
                          >
                            View details
                          </button>
                        </div>
                      )}
                    </div>
                    <span className="timestamp">
                      {new Date(message.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>

              <div className="message-input-area">
                <div className="input-toolbar">
                  <button className="toolbar-btn">B</button>
                  <button className="toolbar-btn">I</button>
                  <button className="toolbar-btn">📎</button>
                </div>
                <textarea placeholder="Type a message..." rows={3} />
                <button className="send-btn">Send</button>
              </div>
            </>
          ) : (
            <div className="no-conversation">
              <p>Select a conversation to start messaging</p>
            </div>
          )}
        </main>

        <aside className="details-sidebar">
          {selectedConversation && (
            <>
              <div className="freelancer-details">
                <div className="avatar-large">
                  {selectedConversation.freelancer.name.charAt(0)}
                </div>
                <h3>{selectedConversation.freelancer.name}</h3>
                <p>{selectedConversation.freelancer.location}</p>
                <p className="rate">
                  ${selectedConversation.freelancer.hourlyRate}/hr
                </p>
              </div>

              {selectedConversation.contract && (
                <div className="contract-details">
                  <h4>Active Contract</h4>
                  <p>{selectedConversation.contract.title}</p>
                  <p className="contract-type">
                    {selectedConversation.contract.type === "hourly"
                      ? `$${selectedConversation.contract.hourlyRate}/hr`
                      : `$${selectedConversation.contract.fixedPrice} fixed`}
                  </p>
                  <a
                    href="#"
                    className="view-details-link"
                    onClick={(e) => {
                      e.preventDefault();
                      onViewContract(selectedConversation.contract!.id);
                    }}
                  >
                    View details
                  </a>
                </div>
              )}

              <div className="collapsible-sections">
                <div className="section">
                  <div
                    className="section-header"
                    onClick={() => toggleSection("status")}
                  >
                    <svg
                      className={`chevron ${expandedSections.status ? "expanded" : ""}`}
                      width="12"
                      height="12"
                      viewBox="0 0 12 12"
                    >
                      <path
                        d="M4 5L6 7L8 5"
                        stroke="currentColor"
                        strokeWidth="2"
                        fill="none"
                      />
                    </svg>
                    <h4>Status</h4>
                  </div>
                  {expandedSections.status && (
                    <div className="section-content">
                      <p className="status-text">Available</p>
                    </div>
                  )}
                </div>

                <div className="section">
                  <div
                    className="section-header"
                    onClick={() => toggleSection("search")}
                  >
                    <svg
                      className={`chevron ${expandedSections.search ? "expanded" : ""}`}
                      width="12"
                      height="12"
                      viewBox="0 0 12 12"
                    >
                      <path
                        d="M4 5L6 7L8 5"
                        stroke="currentColor"
                        strokeWidth="2"
                        fill="none"
                      />
                    </svg>
                    <h4>Search</h4>
                  </div>
                  {expandedSections.search && (
                    <div className="section-content">
                      <input
                        type="search"
                        placeholder="Search in conversation..."
                      />
                    </div>
                  )}
                </div>

                <div className="section">
                  <div
                    className="section-header"
                    onClick={() => toggleSection("people")}
                  >
                    <svg
                      className={`chevron ${expandedSections.people ? "expanded" : ""}`}
                      width="12"
                      height="12"
                      viewBox="0 0 12 12"
                    >
                      <path
                        d="M4 5L6 7L8 5"
                        stroke="currentColor"
                        strokeWidth="2"
                        fill="none"
                      />
                    </svg>
                    <h4>People</h4>
                  </div>
                  {expandedSections.people && (
                    <div className="section-content">
                      <div className="person-item">
                        <div className="avatar-small">
                          {selectedConversation.freelancer.name.charAt(0)}
                        </div>
                        <span>{selectedConversation.freelancer.name}</span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="section">
                  <div
                    className="section-header"
                    onClick={() => toggleSection("filesAndLinks")}
                  >
                    <svg
                      className={`chevron ${expandedSections.filesAndLinks ? "expanded" : ""}`}
                      width="12"
                      height="12"
                      viewBox="0 0 12 12"
                    >
                      <path
                        d="M4 5L6 7L8 5"
                        stroke="currentColor"
                        strokeWidth="2"
                        fill="none"
                      />
                    </svg>
                    <h4>Files and links</h4>
                  </div>
                  {expandedSections.filesAndLinks && (
                    <div className="section-content">
                      <p className="empty-state">
                        No files or links shared yet
                      </p>
                    </div>
                  )}
                </div>

                <div className="section">
                  <div
                    className="section-header"
                    onClick={() => toggleSection("personalNotepad")}
                  >
                    <svg
                      className={`chevron ${expandedSections.personalNotepad ? "expanded" : ""}`}
                      width="12"
                      height="12"
                      viewBox="0 0 12 12"
                    >
                      <path
                        d="M4 5L6 7L8 5"
                        stroke="currentColor"
                        strokeWidth="2"
                        fill="none"
                      />
                    </svg>
                    <h4>Personal notepad</h4>
                  </div>
                  {expandedSections.personalNotepad && (
                    <div className="section-content">
                      <textarea
                        placeholder="Add a note..."
                        rows={3}
                        className="notepad-textarea"
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="skills-section">
                <h4>Skills</h4>
                <div className="skills-list">
                  {selectedConversation.freelancer.skills
                    .slice(0, 5)
                    .map((skill) => (
                      <span key={skill} className="skill-tag">
                        {skill}
                      </span>
                    ))}
                </div>
              </div>
            </>
          )}
        </aside>
      </div>

      <style>{`
        .messages {
          height: calc(100vh - 80px);
          background: white;
        }
        
        .messages-container {
          height: 100%;
          display: grid;
          grid-template-columns: 320px 1fr 280px;
        }
        
        .conversations-sidebar {
          border-right: 1px solid #e0e0e0;
          background: #f9f9f9;
          display: flex;
          flex-direction: column;
        }
        
        .sidebar-header {
          padding: 20px;
          border-bottom: 1px solid #e0e0e0;
        }
        
        .sidebar-header h2 {
          font-size: 20px;
          font-weight: 500;
          margin: 0 0 12px 0;
        }
        
        .sidebar-header input {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid #d0d0d0;
          border-radius: 8px;
          font-size: 14px;
        }
        
        .conversations-list {
          flex: 1;
          overflow-y: auto;
        }
        
        .conversation-item {
          display: flex;
          gap: 12px;
          padding: 16px 20px;
          cursor: pointer;
          transition: background 0.2s;
          border-bottom: 1px solid #e0e0e0;
        }
        
        .conversation-item:hover {
          background: #f0f0f0;
        }
        
        .conversation-item.active {
          background: #e7f5e7;
          border-left: 3px solid #14a800;
          padding-left: 17px;
        }
        
        .conversation-item .avatar {
          width: 40px;
          height: 40px;
          background: #14a800;
          color: white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 600;
          flex-shrink: 0;
        }
        
        .conversation-info {
          flex: 1;
          overflow: hidden;
        }
        
        .conversation-info h4 {
          font-size: 14px;
          font-weight: 500;
          margin: 0 0 4px 0;
        }
        
        .last-message {
          font-size: 13px;
          color: #5e6d55;
          margin: 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        
        .chat-area {
          display: flex;
          flex-direction: column;
          background: white;
        }
        
        .chat-header {
          padding: 20px;
          border-bottom: 1px solid #e0e0e0;
        }
        
        .chat-header-info h3 {
          font-size: 18px;
          font-weight: 500;
          margin: 0 0 4px 0;
        }
        
        .chat-header-info p {
          font-size: 14px;
          color: #5e6d55;
          margin: 0;
        }
        
        .messages-list {
          flex: 1;
          padding: 20px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        
        .message {
          display: flex;
          flex-direction: column;
          max-width: 70%;
        }
        
        .message.sent {
          align-self: flex-end;
          align-items: flex-end;
        }
        
        .message.received {
          align-self: flex-start;
          align-items: flex-start;
        }
        
        .message-content {
          background: #f0f0f0;
          padding: 12px 16px;
          border-radius: 12px;
        }
        
        .message.sent .message-content {
          background: #14a800;
          color: white;
        }
        
        .message-content p {
          margin: 0;
          line-height: 1.4;
        }
        
        .contract-notice {
          margin-top: 12px;
          padding: 12px;
          background: rgba(255, 255, 255, 0.2);
          border-radius: 8px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        
        .message.sent .contract-notice {
          background: rgba(255, 255, 255, 0.2);
        }
        
        .message.received .contract-notice {
          background: white;
        }
        
        .contract-info strong {
          display: block;
          font-size: 14px;
          margin-bottom: 4px;
        }
        
        .contract-info p {
          font-size: 13px;
          opacity: 0.9;
        }
        
        .contract-notice button {
          background: white;
          color: #14a800;
          border: none;
          padding: 6px 12px;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
        }
        
        .message.sent .contract-notice button {
          background: rgba(255, 255, 255, 0.9);
        }
        
        .timestamp {
          font-size: 12px;
          color: #999;
          margin-top: 4px;
        }
        
        .message-input-area {
          padding: 20px;
          border-top: 1px solid #e0e0e0;
        }
        
        .input-toolbar {
          display: flex;
          gap: 8px;
          margin-bottom: 12px;
        }
        
        .toolbar-btn {
          width: 32px;
          height: 32px;
          border: 1px solid #d0d0d0;
          background: white;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 600;
          transition: all 0.2s;
        }
        
        .toolbar-btn:hover {
          background: #f0f0f0;
        }
        
        .message-input-area textarea {
          width: 100%;
          padding: 12px;
          border: 1px solid #d0d0d0;
          border-radius: 8px;
          resize: none;
          font-family: inherit;
          font-size: 14px;
        }
        
        .send-btn {
          margin-top: 12px;
          float: right;
          background: #14a800;
          color: white;
          border: none;
          padding: 8px 20px;
          border-radius: 8px;
          font-weight: 500;
          cursor: pointer;
        }
        
        .send-btn:hover {
          background: #12a200;
        }
        
        .no-conversation {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: #5e6d55;
        }
        
        .details-sidebar {
          border-left: 1px solid #e0e0e0;
          padding: 20px;
          background: #f9f9f9;
        }
        
        .freelancer-details {
          text-align: center;
          padding-bottom: 20px;
          border-bottom: 1px solid #e0e0e0;
        }
        
        .avatar-large {
          width: 80px;
          height: 80px;
          background: #14a800;
          color: white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 32px;
          font-weight: 600;
          margin: 0 auto 16px;
        }
        
        .freelancer-details h3 {
          font-size: 18px;
          font-weight: 500;
          margin: 0 0 4px 0;
        }
        
        .freelancer-details p {
          font-size: 14px;
          color: #5e6d55;
          margin: 0 0 8px 0;
        }
        
        .freelancer-details .rate {
          font-size: 20px;
          font-weight: 600;
          color: #001e00;
        }
        
        .contract-details,
        .skills-section {
          padding: 20px 0;
          border-bottom: 1px solid #e0e0e0;
        }
        
        .contract-details:last-child,
        .skills-section:last-child {
          border-bottom: none;
        }
        
        .contract-details h4,
        .skills-section h4 {
          font-size: 14px;
          font-weight: 500;
          margin: 0 0 12px 0;
        }
        
        .contract-details p {
          font-size: 14px;
          margin: 0 0 4px 0;
        }
        
        .contract-type {
          font-weight: 600;
          color: #14a800;
        }
        
        .view-details-link {
          color: #14a800;
          font-size: 14px;
          text-decoration: none;
          font-weight: 500;
          display: inline-block;
          margin-top: 8px;
        }
        
        .view-details-link:hover {
          text-decoration: underline;
        }
        
        .collapsible-sections {
          padding: 20px 0;
        }
        
        .section {
          border-bottom: 1px solid #e0e0e0;
        }
        
        .section:last-child {
          border-bottom: none;
        }
        
        .section-header {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 0;
          cursor: pointer;
          user-select: none;
        }
        
        .section-header h4 {
          font-size: 14px;
          font-weight: 500;
          margin: 0;
        }
        
        .chevron {
          transition: transform 0.2s;
          color: #5e6d55;
        }
        
        .chevron.expanded {
          transform: rotate(180deg);
        }
        
        .section-content {
          padding: 0 0 16px 20px;
        }
        
        .section-content input[type="search"] {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid #d0d0d0;
          border-radius: 8px;
          font-size: 14px;
        }
        
        .status-text {
          color: #14a800;
          font-weight: 500;
          font-size: 14px;
          margin: 0;
        }
        
        .person-item {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
        }
        
        .avatar-small {
          width: 24px;
          height: 24px;
          background: #14a800;
          color: white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: 600;
        }
        
        .empty-state {
          color: #5e6d55;
          font-size: 14px;
          margin: 0;
        }
        
        .notepad-textarea {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid #d0d0d0;
          border-radius: 8px;
          font-size: 14px;
          resize: none;
          font-family: inherit;
        }
        
        .skills-list {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        
        .skill-tag {
          padding: 4px 10px;
          background: white;
          border: 1px solid #d0d0d0;
          border-radius: 16px;
          font-size: 12px;
          color: #5e6d55;
        }
      `}</style>
    </div>
  );
}
