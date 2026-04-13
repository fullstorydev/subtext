import { Page } from "../types";

interface Props {
  currentPage: Page["type"];
  patientName: string;
  onNavigate: (page: Page) => void;
}

const navItems: { type: Page["type"]; label: string; icon: string }[] = [
  { type: "dashboard", label: "Dashboard", icon: "grid" },
  { type: "profile", label: "My Profile", icon: "user" },
  { type: "orders", label: "Orders", icon: "package" },
  { type: "addresses", label: "Addresses", icon: "map-pin" },
  { type: "payments", label: "Payment Methods", icon: "credit-card" },
  { type: "records", label: "Medical Records", icon: "file-text" },
  { type: "chat", label: "Support Chat", icon: "message-circle" },
];

export function Sidebar({ currentPage, patientName, onNavigate }: Props) {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">MedCart</div>
        <div className="sidebar-patient">{patientName}</div>
      </div>
      <nav className="sidebar-nav">
        {navItems.map((item) => (
          <button
            key={item.type}
            className={`sidebar-link ${currentPage === item.type ? "active" : ""}`}
            onClick={() => onNavigate({ type: item.type } as Page)}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <style>{`
        .sidebar {
          width: 240px;
          min-height: 100vh;
          background: #1a2332;
          color: #fff;
          display: flex;
          flex-direction: column;
          flex-shrink: 0;
        }
        .sidebar-header {
          padding: 24px 20px;
          border-bottom: 1px solid rgba(255,255,255,0.1);
        }
        .sidebar-logo {
          font-size: 1.5rem;
          font-weight: 700;
          color: #4fc3f7;
          margin-bottom: 8px;
        }
        .sidebar-patient {
          font-size: 0.85rem;
          color: rgba(255,255,255,0.6);
        }
        .sidebar-nav {
          padding: 12px 0;
          display: flex;
          flex-direction: column;
        }
        .sidebar-link {
          display: block;
          padding: 10px 20px;
          color: rgba(255,255,255,0.7);
          text-decoration: none;
          font-size: 0.9rem;
          border: none;
          background: none;
          text-align: left;
          cursor: pointer;
          transition: all 0.15s;
          font-family: inherit;
        }
        .sidebar-link:hover {
          background: rgba(255,255,255,0.05);
          color: #fff;
        }
        .sidebar-link.active {
          background: rgba(79, 195, 247, 0.15);
          color: #4fc3f7;
          border-right: 3px solid #4fc3f7;
        }
      `}</style>
    </aside>
  );
}
