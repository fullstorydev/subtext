import { PaymentMethod } from "../types";

interface Props {
  paymentMethods: PaymentMethod[];
}

const cardColors: Record<string, string> = {
  visa: "linear-gradient(135deg, #1a237e, #283593)",
  mastercard: "linear-gradient(135deg, #b71c1c, #d32f2f)",
  amex: "linear-gradient(135deg, #004d40, #00695c)",
};

export function Payments({ paymentMethods }: Props) {
  return (
    <div className="payments">
      <div className="page-header">
        <h1>Payment Methods</h1>
        <button className="btn-primary">Add Card</button>
      </div>

      <div className="cards-grid">
        {paymentMethods.map((pm) => (
          <div
            key={pm.id}
            className="payment-card"
            style={{ background: cardColors[pm.type] }}
          >
            <div className="card-type">
              {pm.type.toUpperCase()}
              {pm.isDefault && <span className="default-label">DEFAULT</span>}
            </div>
            <div className="card-number">{pm.cardNumber}</div>
            <div className="card-bottom">
              <div>
                <div className="card-label">CARDHOLDER</div>
                <div className="card-holder">{pm.cardholderName}</div>
              </div>
              <div>
                <div className="card-label">EXPIRES</div>
                <div className="card-expiry">{pm.expiry}</div>
              </div>
            </div>
            <div className="card-actions">
              <button className="btn-card">Edit</button>
              <button className="btn-card">Remove</button>
            </div>
          </div>
        ))}
      </div>

      <style>{`
        .payments .page-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
        }
        .payments h1 { font-size: 1.5rem; margin: 0; }
        .cards-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 20px;
        }
        .payment-card {
          border-radius: 12px;
          padding: 24px;
          color: #fff;
          min-height: 200px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }
        .card-type {
          font-size: 0.85rem;
          font-weight: 600;
          letter-spacing: 1px;
          display: flex;
          justify-content: space-between;
        }
        .default-label {
          background: rgba(255,255,255,0.2);
          padding: 2px 8px;
          border-radius: 10px;
          font-size: 0.7rem;
        }
        .card-number {
          font-size: 1.3rem;
          letter-spacing: 2px;
          font-family: 'Courier New', monospace;
          margin: 16px 0;
        }
        .card-bottom {
          display: flex;
          justify-content: space-between;
        }
        .card-label {
          font-size: 0.65rem;
          opacity: 0.7;
          letter-spacing: 1px;
          margin-bottom: 2px;
        }
        .card-holder { font-size: 0.85rem; letter-spacing: 0.5px; }
        .card-expiry { font-size: 0.9rem; }
        .card-actions {
          display: flex;
          gap: 12px;
          margin-top: 12px;
          padding-top: 12px;
          border-top: 1px solid rgba(255,255,255,0.2);
        }
        .btn-card {
          background: rgba(255,255,255,0.15);
          border: none;
          color: #fff;
          padding: 6px 16px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 0.8rem;
          font-family: inherit;
        }
        .btn-card:hover { background: rgba(255,255,255,0.25); }
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
      `}</style>
    </div>
  );
}
