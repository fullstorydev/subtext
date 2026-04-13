import { useState } from "preact/hooks";
import { Contract, Freelancer } from "../types";

interface Props {
  contract?: Contract;
  freelancer?: Freelancer;
  onMessage: (freelancerId: string) => void;
}

export function OfferSent({ contract, freelancer, onMessage }: Props) {
  const [showFullOffer, setShowFullOffer] = useState(false);
  const [expandedFaq, setExpandedFaq] = useState<string | null>(null);

  if (!contract || !freelancer) {
    return <div>Contract not found</div>;
  }

  return (
    <div className="offer-sent">
      <div className="container">
        <main className="main-content">
          <div className="success-header">
            <div className="success-icon">✓</div>
            <h1>{contract.title}</h1>
            <p className="subtitle">Offer sent to {freelancer.name}</p>
          </div>

          <div className="contract-summary">
            <h2>Contract details</h2>

            <div className="details-grid">
              <div className="detail-row">
                <span className="label">Freelancer</span>
                <span className="value">{freelancer.name}</span>
              </div>

              <div className="detail-row">
                <span className="label">Contract type</span>
                <span className="value">
                  {contract.type === "hourly" ? "Hourly" : "Fixed price"}
                </span>
              </div>

              {contract.type === "hourly" && (
                <>
                  <div className="detail-row">
                    <span className="label">Hourly rate</span>
                    <span className="value">${contract.hourlyRate}/hr</span>
                  </div>

                  {contract.weeklyLimit && (
                    <div className="detail-row">
                      <span className="label">Weekly limit</span>
                      <span className="value">
                        {contract.weeklyLimit} hrs/week
                      </span>
                    </div>
                  )}
                </>
              )}

              {contract.type === "fixed" && (
                <>
                  <div className="detail-row">
                    <span className="label">Fixed price</span>
                    <span className="value">${contract.fixedPrice}</span>
                  </div>

                  {contract.automaticPayment && (
                    <div className="detail-row">
                      <span className="label">Automatic weekly payment</span>
                      <span className="value">
                        ${contract.automaticPayment}/week
                      </span>
                    </div>
                  )}
                </>
              )}

              {contract.hiringTeam && (
                <div className="detail-row">
                  <span className="label">Hiring team</span>
                  <span className="value">{contract.hiringTeam}</span>
                </div>
              )}

              {contract.description && (
                <div className="detail-row full-width">
                  <span className="label">Work description</span>
                  <span className="value">{contract.description}</span>
                </div>
              )}
            </div>

            <button
              className="see-full-offer"
              onClick={() => setShowFullOffer(!showFullOffer)}
            >
              {showFullOffer ? "Hide full offer" : "See full offer"}
            </button>

            {showFullOffer && (
              <div className="full-offer">
                <h3>Full offer details</h3>
                <div className="offer-section">
                  <h4>Payment terms</h4>
                  <p>
                    {contract.type === "hourly"
                      ? `Hourly rate: $${contract.hourlyRate}/hr with a weekly limit of ${contract.weeklyLimit} hours`
                      : `Fixed price: $${contract.fixedPrice}`}
                  </p>
                  {contract.automaticPayment && (
                    <p>
                      Automatic weekly payment: ${contract.automaticPayment}
                    </p>
                  )}
                </div>

                <div className="offer-section">
                  <h4>Scope of work</h4>
                  <p>{contract.description || "No description provided"}</p>
                </div>

                <div className="offer-section">
                  <h4>Contract terms</h4>
                  <p>This contract is governed by Topwork's Terms of Service</p>
                </div>
              </div>
            )}
          </div>

          <div className="faq-section">
            <h2>Frequently asked questions</h2>

            <div className="faq-item">
              <button
                className="faq-question"
                onClick={() =>
                  setExpandedFaq(expandedFaq === "hourly" ? null : "hourly")
                }
              >
                <span>How do hourly contracts work?</span>
                <span className="toggle">
                  {expandedFaq === "hourly" ? "-" : "+"}
                </span>
              </button>
              {expandedFaq === "hourly" && (
                <div className="faq-answer">
                  <p>
                    Hourly contracts allow you to pay freelancers for the time
                    they work. Freelancers track their time using Topwork's time
                    tracker, which takes screenshots to verify work activity.
                    You're billed weekly for hours worked.
                  </p>
                </div>
              )}
            </div>

            <div className="faq-item">
              <button
                className="faq-question"
                onClick={() =>
                  setExpandedFaq(expandedFaq === "fixed" ? null : "fixed")
                }
              >
                <span>How do fixed-price contracts work?</span>
                <span className="toggle">
                  {expandedFaq === "fixed" ? null : "+"}
                </span>
              </button>
              {expandedFaq === "fixed" && (
                <div className="faq-answer">
                  <p>
                    Fixed-price contracts have set milestones with specific
                    deliverables and payments. You fund milestones upfront, and
                    money is released to the freelancer when you approve their
                    work.
                  </p>
                </div>
              )}
            </div>

            <div className="faq-item">
              <button
                className="faq-question"
                onClick={() =>
                  setExpandedFaq(expandedFaq === "escrow" ? null : "escrow")
                }
              >
                <span>How does payment protection work?</span>
                <span className="toggle">
                  {expandedFaq === "escrow" ? "-" : "+"}
                </span>
              </button>
              {expandedFaq === "escrow" && (
                <div className="faq-answer">
                  <p>
                    Topwork's Payment Protection ensures that freelancers get
                    paid for their work and clients get the work they paid for.
                    For hourly contracts, you're only charged for hours tracked
                    with the time tracker. For fixed-price contracts, funds are
                    held in escrow until you approve the work.
                  </p>
                </div>
              )}
            </div>
          </div>
        </main>

        <aside className="sidebar">
          <div className="action-card">
            <h3>Next steps</h3>
            <p>
              Your offer has been sent to {freelancer.name}. They have 24 hours
              to respond.
            </p>

            <button
              className="chat-btn"
              onClick={() => onMessage(freelancer.id)}
            >
              Chat with {freelancer.name.split(" ")[0]}
            </button>

            <button className="view-contact-btn">View contact</button>
          </div>

          <div className="freelancer-card">
            <div className="avatar">{freelancer.name.charAt(0)}</div>
            <h4>{freelancer.name}</h4>
            <p className="title">{freelancer.title}</p>
            <p className="location">{freelancer.location}</p>
            <div className="stats">
              <span>${freelancer.hourlyRate}/hr</span>
              <span>★ {freelancer.rating}</span>
            </div>
          </div>

          <div className="help-card">
            <h4>Need help?</h4>
            <a href="#">Visit Help Center</a>
            <a href="#">Contact Support</a>
          </div>
        </aside>
      </div>

      <style>{`
        .offer-sent {
          min-height: calc(100vh - 80px);
          background: #f2f2f2;
          padding: 40px 20px;
        }
        
        .container {
          max-width: 1200px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: 1fr 320px;
          gap: 30px;
        }
        
        .main-content {
          background: white;
          border-radius: 12px;
          padding: 40px;
        }
        
        .success-header {
          text-align: center;
          margin-bottom: 40px;
        }
        
        .success-icon {
          width: 60px;
          height: 60px;
          background: #14a800;
          color: white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 30px;
          font-weight: bold;
          margin: 0 auto 20px;
        }
        
        .success-header h1 {
          font-size: 28px;
          font-weight: 500;
          margin: 0 0 8px 0;
        }
        
        .subtitle {
          color: #5e6d55;
          font-size: 16px;
          margin: 0;
        }
        
        .contract-summary {
          margin-bottom: 40px;
        }
        
        .contract-summary h2 {
          font-size: 20px;
          font-weight: 500;
          margin: 0 0 20px 0;
        }
        
        .details-grid {
          display: grid;
          gap: 16px;
          margin-bottom: 20px;
        }
        
        .detail-row {
          display: grid;
          grid-template-columns: 200px 1fr;
          gap: 20px;
          padding: 12px 0;
          border-bottom: 1px solid #f0f0f0;
        }
        
        .detail-row.full-width {
          grid-template-columns: 1fr;
        }
        
        .detail-row.full-width .label {
          margin-bottom: 8px;
          display: block;
        }
        
        .label {
          color: #5e6d55;
          font-size: 14px;
        }
        
        .value {
          color: #001e00;
          font-size: 14px;
          font-weight: 500;
        }
        
        .see-full-offer {
          background: white;
          color: #14a800;
          border: 2px solid #14a800;
          padding: 10px 20px;
          border-radius: 10px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .see-full-offer:hover {
          background: #14a800;
          color: white;
        }
        
        .full-offer {
          margin-top: 30px;
          padding: 30px;
          background: #f9f9f9;
          border-radius: 8px;
        }
        
        .full-offer h3 {
          font-size: 18px;
          font-weight: 500;
          margin: 0 0 20px 0;
        }
        
        .offer-section {
          margin-bottom: 24px;
        }
        
        .offer-section:last-child {
          margin-bottom: 0;
        }
        
        .offer-section h4 {
          font-size: 16px;
          font-weight: 500;
          margin: 0 0 8px 0;
        }
        
        .offer-section p {
          margin: 0 0 8px 0;
          color: #333;
          line-height: 1.5;
        }
        
        .faq-section h2 {
          font-size: 20px;
          font-weight: 500;
          margin: 0 0 20px 0;
        }
        
        .faq-item {
          border-bottom: 1px solid #e0e0e0;
        }
        
        .faq-question {
          width: 100%;
          padding: 16px 0;
          background: none;
          border: none;
          display: flex;
          justify-content: space-between;
          align-items: center;
          cursor: pointer;
          font-size: 16px;
          font-weight: 500;
          text-align: left;
        }
        
        .faq-question:hover {
          color: #14a800;
        }
        
        .toggle {
          font-size: 24px;
          color: #5e6d55;
        }
        
        .faq-answer {
          padding: 0 0 16px 0;
        }
        
        .faq-answer p {
          margin: 0;
          color: #5e6d55;
          line-height: 1.6;
        }
        
        .sidebar {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        
        .action-card,
        .freelancer-card,
        .help-card {
          background: white;
          border-radius: 12px;
          padding: 24px;
        }
        
        .action-card h3 {
          font-size: 18px;
          font-weight: 500;
          margin: 0 0 12px 0;
        }
        
        .action-card p {
          font-size: 14px;
          color: #5e6d55;
          margin: 0 0 20px 0;
          line-height: 1.5;
        }
        
        .chat-btn,
        .view-contact-btn {
          width: 100%;
          padding: 10px 20px;
          border-radius: 10px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          margin-bottom: 12px;
          border: none;
        }
        
        .chat-btn {
          background: #14a800;
          color: white;
        }
        
        .chat-btn:hover {
          background: #12a200;
        }
        
        .view-contact-btn {
          background: white;
          color: #14a800;
          border: 2px solid #14a800;
        }
        
        .view-contact-btn:hover {
          background: #f0f9f0;
        }
        
        .freelancer-card {
          text-align: center;
        }
        
        .freelancer-card .avatar {
          width: 60px;
          height: 60px;
          background: #14a800;
          color: white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 24px;
          font-weight: 600;
          margin: 0 auto 12px;
        }
        
        .freelancer-card h4 {
          font-size: 16px;
          font-weight: 500;
          margin: 0 0 4px 0;
        }
        
        .freelancer-card .title {
          font-size: 14px;
          color: #5e6d55;
          margin: 0 0 4px 0;
        }
        
        .freelancer-card .location {
          font-size: 13px;
          color: #999;
          margin: 0 0 12px 0;
        }
        
        .freelancer-card .stats {
          display: flex;
          justify-content: center;
          gap: 16px;
          font-size: 14px;
        }
        
        .freelancer-card .stats span:last-child {
          color: #ff9800;
        }
        
        .help-card h4 {
          font-size: 16px;
          font-weight: 500;
          margin: 0 0 12px 0;
        }
        
        .help-card a {
          display: block;
          color: #14a800;
          text-decoration: none;
          font-size: 14px;
          margin-bottom: 8px;
        }
        
        .help-card a:hover {
          text-decoration: underline;
        }
      `}</style>
    </div>
  );
}
