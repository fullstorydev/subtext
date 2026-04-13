import { AppState, Page } from "../types";

interface Props {
  state: AppState;
  onNavigate: (page: Page) => void;
}

export function Dashboard({ state, onNavigate }: Props) {
  const { patient, orders, medicalRecords, chatThreads } = state;
  const recentOrders = orders.slice(0, 3);
  const openChats = chatThreads.filter((t) => t.status === "open");

  return (
    <div className="dashboard">
      <h1>Welcome back, {patient.firstName}</h1>

      <div className="dashboard-grid">
        <div className="card patient-summary">
          <h2>Patient Information</h2>
          <div className="info-row">
            <span className="label">Name</span>
            <span className="value">
              {patient.firstName} {patient.lastName}
            </span>
          </div>
          <div className="info-row">
            <span className="label">Email</span>
            <span className="value">{patient.email}</span>
          </div>
          <div className="info-row">
            <span className="label">Phone</span>
            <span className="value">{patient.phone}</span>
          </div>
          <div className="info-row">
            <span className="label">DOB</span>
            <span className="value">{patient.dateOfBirth}</span>
          </div>
          <div className="info-row">
            <span className="label">Insurance</span>
            <span className="value">
              {patient.insuranceProvider} — {patient.insuranceId}
            </span>
          </div>
          <button
            className="link-btn"
            onClick={() => onNavigate({ type: "profile" })}
          >
            View full profile
          </button>
        </div>

        <div className="card">
          <h2>Recent Orders</h2>
          {recentOrders.map((order) => (
            <div key={order.id} className="order-row">
              <div className="order-id">{order.id}</div>
              <div className="order-detail">
                {order.items.length} item{order.items.length > 1 ? "s" : ""} —
                Shipped to {order.shippingAddress.recipientName},{" "}
                {order.shippingAddress.city} {order.shippingAddress.state}
              </div>
              <span className={`status-badge status-${order.status}`}>
                {order.status}
              </span>
            </div>
          ))}
          <button
            className="link-btn"
            onClick={() => onNavigate({ type: "orders" })}
          >
            View all orders
          </button>
        </div>

        <div className="card">
          <h2>Upcoming Medications</h2>
          {medicalRecords
            .flatMap((r) => r.medications)
            .slice(0, 5)
            .map((med, i) => (
              <div key={i} className="med-row">
                {med}
              </div>
            ))}
          <button
            className="link-btn"
            onClick={() => onNavigate({ type: "records" })}
          >
            View medical records
          </button>
        </div>

        <div className="card">
          <h2>Support</h2>
          {openChats.length > 0 ? (
            openChats.map((thread) => (
              <div key={thread.id} className="chat-preview">
                <div className="chat-subject">{thread.subject}</div>
                <div className="chat-last">
                  {thread.messages[thread.messages.length - 1].content.slice(
                    0,
                    80,
                  )}
                  ...
                </div>
              </div>
            ))
          ) : (
            <p className="muted">No open support tickets</p>
          )}
          <button
            className="link-btn"
            onClick={() => onNavigate({ type: "chat" })}
          >
            View all chats
          </button>
        </div>
      </div>

      <style>{`
        .dashboard h1 {
          font-size: 1.5rem;
          margin-bottom: 24px;
        }
        .dashboard-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
        }
        .card {
          background: #fff;
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          padding: 20px;
        }
        .card h2 {
          font-size: 1rem;
          margin: 0 0 16px;
          color: #333;
        }
        .info-row {
          display: flex;
          justify-content: space-between;
          padding: 6px 0;
          border-bottom: 1px solid #f0f0f0;
          font-size: 0.9rem;
        }
        .info-row .label { color: #666; }
        .info-row .value { font-weight: 500; }
        .order-row {
          padding: 8px 0;
          border-bottom: 1px solid #f0f0f0;
        }
        .order-id { font-weight: 600; font-size: 0.85rem; }
        .order-detail { font-size: 0.85rem; color: #555; margin-top: 2px; }
        .status-badge {
          display: inline-block;
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 0.75rem;
          font-weight: 500;
          margin-top: 4px;
        }
        .status-delivered { background: #e8f5e9; color: #2e7d32; }
        .status-shipped { background: #e3f2fd; color: #1565c0; }
        .status-processing { background: #fff3e0; color: #e65100; }
        .status-cancelled { background: #fce4ec; color: #c62828; }
        .med-row {
          padding: 6px 0;
          border-bottom: 1px solid #f0f0f0;
          font-size: 0.9rem;
        }
        .chat-preview { padding: 8px 0; border-bottom: 1px solid #f0f0f0; }
        .chat-subject { font-weight: 600; font-size: 0.9rem; }
        .chat-last { font-size: 0.8rem; color: #666; margin-top: 4px; }
        .link-btn {
          display: inline-block;
          margin-top: 12px;
          padding: 0;
          background: none;
          border: none;
          color: #1976d2;
          cursor: pointer;
          font-size: 0.85rem;
          font-family: inherit;
        }
        .link-btn:hover { text-decoration: underline; }
        .muted { color: #999; font-size: 0.9rem; }
      `}</style>
    </div>
  );
}
