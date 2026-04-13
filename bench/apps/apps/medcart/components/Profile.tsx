import { Patient } from "../types";

interface Props {
  patient: Patient;
}

export function Profile({ patient }: Props) {
  return (
    <div className="profile">
      <h1>My Profile</h1>
      <div className="profile-card">
        <form>
          <div className="form-grid">
            <div className="form-group">
              <label htmlFor="firstName">First Name</label>
              <input
                id="firstName"
                type="text"
                value={patient.firstName}
                readOnly
              />
            </div>
            <div className="form-group">
              <label htmlFor="lastName">Last Name</label>
              <input
                id="lastName"
                type="text"
                value={patient.lastName}
                readOnly
              />
            </div>
            <div className="form-group">
              <label htmlFor="email">Email Address</label>
              <input id="email" type="email" value={patient.email} readOnly />
            </div>
            <div className="form-group">
              <label htmlFor="phone">Phone Number</label>
              <input id="phone" type="tel" value={patient.phone} readOnly />
            </div>
            <div className="form-group">
              <label htmlFor="dob">Date of Birth</label>
              <input
                id="dob"
                type="text"
                value={patient.dateOfBirth}
                readOnly
              />
            </div>
            <div className="form-group">
              <label htmlFor="ssn">Social Security Number</label>
              <input id="ssn" type="text" value={patient.ssn} readOnly />
            </div>
            <div className="form-group full-width">
              <label htmlFor="insuranceProvider">Insurance Provider</label>
              <input
                id="insuranceProvider"
                type="text"
                value={patient.insuranceProvider}
                readOnly
              />
            </div>
            <div className="form-group full-width">
              <label htmlFor="insuranceId">Insurance Member ID</label>
              <input
                id="insuranceId"
                type="text"
                value={patient.insuranceId}
                readOnly
              />
            </div>
          </div>
          <button type="button" className="btn-primary">
            Edit Profile
          </button>
        </form>
      </div>

      <style>{`
        .profile h1 { font-size: 1.5rem; margin-bottom: 24px; }
        .profile-card {
          background: #fff;
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          padding: 24px;
          max-width: 700px;
        }
        .form-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          margin-bottom: 24px;
        }
        .form-group { display: flex; flex-direction: column; }
        .form-group.full-width { grid-column: 1 / -1; }
        .form-group label {
          font-size: 0.8rem;
          font-weight: 600;
          color: #555;
          margin-bottom: 4px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .form-group input {
          padding: 10px 12px;
          border: 1px solid #ddd;
          border-radius: 6px;
          font-size: 0.95rem;
          background: #fafafa;
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
        .btn-primary:hover { background: #1565c0; }
      `}</style>
    </div>
  );
}
