import { Address } from "../types";

interface Props {
  addresses: Address[];
}

export function Addresses({ addresses }: Props) {
  return (
    <div className="addresses">
      <div className="page-header">
        <h1>Saved Addresses</h1>
        <button className="btn-primary">Add New Address</button>
      </div>

      <div className="address-grid">
        {addresses.map((addr) => (
          <div key={addr.id} className="address-card">
            <div className="address-label">
              {addr.label}
              {addr.isDefault && <span className="default-badge">Default</span>}
            </div>
            <div className="address-name">{addr.recipientName}</div>
            <div className="address-line">{addr.street}</div>
            {addr.apt && <div className="address-line">{addr.apt}</div>}
            <div className="address-line">
              {addr.city}, {addr.state} {addr.zip}
            </div>
            <div className="address-phone">{addr.recipientPhone}</div>
            <div className="address-actions">
              <button className="btn-text">Edit</button>
              <button className="btn-text btn-danger">Remove</button>
            </div>
          </div>
        ))}
      </div>

      <div className="add-form-section">
        <h2>Add New Address</h2>
        <form className="address-form">
          <div className="form-grid">
            <div className="form-group">
              <label>Label (e.g. Home, Work)</label>
              <input type="text" placeholder="Home" />
            </div>
            <div className="form-group">
              <label>Recipient Name</label>
              <input type="text" placeholder="Full name" />
            </div>
            <div className="form-group">
              <label>Phone Number</label>
              <input type="tel" placeholder="(555) 555-0000" />
            </div>
            <div className="form-group full-width">
              <label>Street Address</label>
              <input type="text" placeholder="123 Main St" />
            </div>
            <div className="form-group">
              <label>Apt / Suite / Unit</label>
              <input type="text" placeholder="Apt 4B" />
            </div>
            <div className="form-group">
              <label>City</label>
              <input type="text" placeholder="City" />
            </div>
            <div className="form-group">
              <label>State</label>
              <input type="text" placeholder="State" />
            </div>
            <div className="form-group">
              <label>ZIP Code</label>
              <input type="text" placeholder="30327" />
            </div>
          </div>
          <button type="button" className="btn-primary">
            Save Address
          </button>
        </form>
      </div>

      <style>{`
        .addresses .page-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
        }
        .addresses h1 { font-size: 1.5rem; margin: 0; }
        .address-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 16px;
          margin-bottom: 32px;
        }
        .address-card {
          background: #fff;
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          padding: 20px;
        }
        .address-label {
          font-weight: 700;
          font-size: 0.95rem;
          margin-bottom: 8px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .default-badge {
          font-size: 0.7rem;
          background: #e3f2fd;
          color: #1565c0;
          padding: 2px 8px;
          border-radius: 12px;
          font-weight: 500;
        }
        .address-name { font-weight: 600; margin-bottom: 4px; }
        .address-line { font-size: 0.9rem; color: #444; }
        .address-phone { font-size: 0.9rem; color: #666; margin-top: 8px; }
        .address-actions { margin-top: 12px; display: flex; gap: 12px; }
        .btn-text {
          background: none;
          border: none;
          color: #1976d2;
          cursor: pointer;
          font-size: 0.85rem;
          padding: 0;
          font-family: inherit;
        }
        .btn-danger { color: #c62828; }
        .add-form-section {
          background: #fff;
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          padding: 24px;
          max-width: 700px;
        }
        .add-form-section h2 { font-size: 1.1rem; margin: 0 0 16px; }
        .form-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-bottom: 20px;
        }
        .form-group { display: flex; flex-direction: column; }
        .form-group.full-width { grid-column: 1 / -1; }
        .form-group label {
          font-size: 0.8rem;
          font-weight: 600;
          color: #555;
          margin-bottom: 4px;
        }
        .form-group input {
          padding: 10px 12px;
          border: 1px solid #ddd;
          border-radius: 6px;
          font-size: 0.9rem;
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
      `}</style>
    </div>
  );
}
