import { useState } from "preact/hooks";
import { User, Page } from "../types";

interface Props {
  user: User;
  onNavigate: (page: Page) => void;
}

export function Header({ user, onNavigate }: Props) {
  const [searchType, setSearchType] = useState<"Jobs" | "Projects">("Jobs");
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  return (
    <header className="header">
      <div className="header-content">
        <div className="logo" onClick={() => onNavigate({ type: "dashboard" })}>
          <svg width="124" height="28" viewBox="0 0 102 28" fill="none">
            <path
              d="M24.5 14C24.5 19.799 19.799 24.5 14 24.5C8.201 24.5 3.5 19.799 3.5 14C3.5 8.201 8.201 3.5 14 3.5C19.799 3.5 24.5 8.201 24.5 14Z"
              fill="#14a800"
            />
            <text
              x="30"
              y="20"
              font-family="Arial, sans-serif"
              font-size="20"
              font-weight="600"
              fill="#001e00"
            >
              Topwork
            </text>
          </svg>
        </div>

        <div className="search-container">
          <input type="text" className="search-input" placeholder="Search" />
          <div
            className="search-type-selector"
            onMouseEnter={() => setShowSearchDropdown(true)}
            onMouseLeave={(e) => {
              // Only hide if we're not hovering over the dropdown
              const relatedTarget = e.relatedTarget as HTMLElement;
              if (
                !relatedTarget ||
                !relatedTarget.closest(".search-dropdown")
              ) {
                setShowSearchDropdown(false);
              }
            }}
          >
            <button className="search-type-btn">
              {searchType}
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="currentColor"
              >
                <path d="M6 8L2 4h8L6 8z" />
              </svg>
            </button>
            {showSearchDropdown && (
              <div
                className="search-dropdown"
                onMouseEnter={() => setShowSearchDropdown(true)}
                onMouseLeave={() => setShowSearchDropdown(false)}
              >
                <div
                  className={`dropdown-item ${searchType === "Jobs" ? "active" : ""}`}
                  onClick={() => setSearchType("Jobs")}
                  onMouseEnter={(e) => e.currentTarget.classList.add("hover")}
                  onMouseLeave={(e) =>
                    e.currentTarget.classList.remove("hover")
                  }
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    style="margin-right: 8px;"
                  >
                    <path d="M20 6h-2.18c.11-.31.18-.65.18-1a2.996 2.996 0 00-5.5-1.65l-.5.67-.5-.68C10.96 2.54 10.05 2 9 2 7.34 2 6 3.34 6 5c0 .35.07.69.18 1H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-5-2c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zM9 4c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1z" />
                  </svg>
                  Jobs
                </div>
                <div
                  className={`dropdown-item ${searchType === "Projects" ? "active" : ""}`}
                  onClick={() => setSearchType("Projects")}
                  onMouseEnter={(e) => e.currentTarget.classList.add("hover")}
                  onMouseLeave={(e) =>
                    e.currentTarget.classList.remove("hover")
                  }
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    style="margin-right: 8px;"
                  >
                    <path d="M10 2v2H5.98C4.89 4 4 4.9 4 6v11c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2v-5h2V6c0-1.1-.9-2-2-2h-4.18C14.4 2.84 13.3 2 12 2h-2zm0 2h2v2h-2V4zm2 6L7 15l1.41 1.41L11 13.83V21h2v-7.17l2.59 2.58L17 15l-5-5z" />
                  </svg>
                  Projects
                </div>
                <div className="dropdown-divider"></div>
                <div
                  className="dropdown-item"
                  onMouseEnter={(e) => e.currentTarget.classList.add("hover")}
                  onMouseLeave={(e) =>
                    e.currentTarget.classList.remove("hover")
                  }
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    style="margin-right: 8px;"
                  >
                    <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
                  </svg>
                  Talent
                </div>
                <div className="dropdown-divider"></div>
                <div className="dropdown-note">
                  Find freelancers and agencies
                </div>
              </div>
            )}
          </div>
        </div>

        <nav className="main-nav">
          <div
            className="nav-item"
            onMouseEnter={() => setActiveDropdown("jobs")}
            onMouseLeave={(e) => {
              const relatedTarget = e.relatedTarget as HTMLElement;
              if (!relatedTarget || !relatedTarget.closest(".nav-dropdown")) {
                setActiveDropdown(null);
              }
            }}
          >
            <a href="#" className="nav-link active">
              Jobs
            </a>
            {activeDropdown === "jobs" && (
              <div
                className="nav-dropdown"
                onMouseEnter={() => setActiveDropdown("jobs")}
                onMouseLeave={() => setActiveDropdown(null)}
              >
                <a
                  href="#"
                  className="dropdown-item"
                  onClick={(e) => {
                    e.preventDefault();
                    onNavigate({ type: "job-post" });
                  }}
                >
                  Post a job
                </a>
                <a href="#" className="dropdown-item">
                  Your Dashboard
                </a>
                <a href="#" className="dropdown-item">
                  All Job Posts
                </a>
                <a href="#" className="dropdown-item">
                  All Contracts
                </a>
              </div>
            )}
          </div>
          <div
            className="nav-item"
            onMouseEnter={() => setActiveDropdown("talent")}
            onMouseLeave={(e) => {
              const relatedTarget = e.relatedTarget as HTMLElement;
              if (!relatedTarget || !relatedTarget.closest(".nav-dropdown")) {
                setActiveDropdown(null);
              }
            }}
          >
            <a href="#" className="nav-link">
              Talent
            </a>
            {activeDropdown === "talent" && (
              <div
                className="nav-dropdown"
                onMouseEnter={() => setActiveDropdown("talent")}
                onMouseLeave={() => setActiveDropdown(null)}
              >
                <a href="#" className="dropdown-item">
                  Discover
                </a>
                <a href="#" className="dropdown-item">
                  Your Hires
                </a>
                <a href="#" className="dropdown-item">
                  Company Hires
                </a>
                <a href="#" className="dropdown-item">
                  Recently viewed
                </a>
                <a href="#" className="dropdown-item">
                  Saved talent
                </a>
              </div>
            )}
          </div>
          <div
            className="nav-item"
            onMouseEnter={() => setActiveDropdown("reports")}
            onMouseLeave={(e) => {
              const relatedTarget = e.relatedTarget as HTMLElement;
              if (!relatedTarget || !relatedTarget.closest(".nav-dropdown")) {
                setActiveDropdown(null);
              }
            }}
          >
            <a href="#" className="nav-link">
              Reports
            </a>
            {activeDropdown === "reports" && (
              <div
                className="nav-dropdown"
                onMouseEnter={() => setActiveDropdown("reports")}
                onMouseLeave={() => setActiveDropdown(null)}
              >
                <a href="#" className="dropdown-item">
                  Account Overview
                </a>
                <a href="#" className="dropdown-item">
                  Weekly Summary
                </a>
                <a href="#" className="dropdown-item">
                  Financials
                </a>
                <a href="#" className="dropdown-item">
                  Transaction History
                </a>
                <a href="#" className="dropdown-item">
                  Budgets
                </a>
                <a href="#" className="dropdown-item">
                  Freelancer Activity
                </a>
                <a href="#" className="dropdown-item">
                  Timesheet
                </a>
                <a href="#" className="dropdown-item">
                  Work Diary
                </a>
                <a href="#" className="dropdown-item">
                  Time by Freelancer
                </a>
                <a href="#" className="dropdown-item">
                  All Work Diaries
                </a>
                <a href="#" className="dropdown-item">
                  Custom Export
                </a>
              </div>
            )}
          </div>
          <a
            href="#"
            className="nav-link"
            onClick={(e) => {
              e.preventDefault();
              onNavigate({ type: "messages" });
            }}
          >
            Messages
          </a>
        </nav>

        <div className="header-actions">
          <button
            className="post-job-btn"
            onClick={() => onNavigate({ type: "job-post" })}
          >
            Post a job
          </button>
          <div className="notifications">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
            </svg>
          </div>
          <div className="user-menu">
            <div className="avatar">{user.name.charAt(0)}</div>
          </div>
        </div>
      </div>

      <style>{`
        .header {
          background: white;
          border-bottom: 1px solid #e0e0e0;
          position: sticky;
          top: 0;
          z-index: 100;
        }
        
        .header-content {
          max-width: 1440px;
          margin: 0 auto;
          padding: 16px 20px;
          display: flex;
          align-items: center;
          gap: 24px;
        }
        
        .logo {
          cursor: pointer;
          display: flex;
          align-items: center;
        }
        
        .search-container {
          display: flex;
          align-items: center;
          background: #f2f7f2;
          border-radius: 10px;
          padding: 0 4px;
          width: 300px;
        }
        
        .search-input {
          flex: 1;
          background: none;
          border: none;
          padding: 8px 12px;
          font-size: 14px;
          outline: none;
        }
        
        .search-input::placeholder {
          color: #5e6d55;
        }
        
        .search-type-selector {
          position: relative;
        }
        
        .search-type-btn {
          background: none;
          border: none;
          padding: 8px 12px;
          display: flex;
          align-items: center;
          gap: 4px;
          cursor: pointer;
          font-size: 14px;
          color: #001e00;
          border-radius: 8px;
          transition: background 0.2s;
        }
        
        .search-type-btn:hover {
          background: rgba(0, 30, 0, 0.05);
        }
        
        .search-dropdown {
          position: absolute;
          top: calc(100% + 4px);
          right: 0;
          background: white;
          border-radius: 8px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
          padding: 4px;
          min-width: 120px;
        }
        
        .search-dropdown::before {
          content: '';
          position: absolute;
          top: -4px;
          left: 0;
          right: 0;
          height: 4px;
          background: transparent;
        }
        
        .main-nav {
          display: flex;
          gap: 30px;
          flex: 1;
        }
        
        .nav-item {
          position: relative;
        }
        
        .nav-link {
          text-decoration: none;
          color: #5e6d55;
          font-size: 14px;
          font-weight: 500;
          padding: 8px 0;
          border-bottom: 2px solid transparent;
          transition: all 0.2s;
          display: inline-block;
        }
        
        .nav-link:hover {
          color: #001e00;
        }
        
        .nav-link.active {
          color: #001e00;
          border-bottom-color: #14a800;
        }
        
        .nav-dropdown {
          position: absolute;
          top: calc(100% + 8px);
          left: 0;
          background: white;
          border-radius: 8px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
          padding: 8px;
          min-width: 200px;
        }
        
        .nav-dropdown::before {
          content: '';
          position: absolute;
          top: -8px;
          left: 0;
          right: 0;
          height: 8px;
          background: transparent;
        }
        
        .dropdown-item {
          display: block;
          padding: 8px 12px;
          text-decoration: none;
          color: #001e00;
          font-size: 14px;
          border-radius: 4px;
          transition: background 0.2s;
          cursor: pointer;
        }
        
        .dropdown-item:hover, .dropdown-item.hover {
          background: #f2f7f2;
        }
        
        .dropdown-item.active {
          font-weight: 500;
        }
        
        .dropdown-divider {
          height: 1px;
          background: #e0e0e0;
          margin: 4px 0;
        }
        
        .dropdown-note {
          font-size: 12px;
          color: #5e6d55;
          padding: 8px 12px;
        }
        
        .header-actions {
          display: flex;
          align-items: center;
          gap: 20px;
        }
        
        .post-job-btn {
          background: #14a800;
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 10px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.2s;
        }
        
        .post-job-btn:hover {
          background: #12a200;
        }
        
        .notifications {
          color: #5e6d55;
          cursor: pointer;
          display: flex;
          align-items: center;
        }
        
        .notifications:hover {
          color: #001e00;
        }
        
        .avatar {
          width: 32px;
          height: 32px;
          background: #14a800;
          color: white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 600;
          cursor: pointer;
        }
      `}</style>
    </header>
  );
}
