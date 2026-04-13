import { MedicalRecord } from "../types";

interface Props {
  records: MedicalRecord[];
}

export function Records({ records }: Props) {
  return (
    <div className="records">
      <h1>Medical Records</h1>

      <div className="records-list">
        {records.map((rec) => (
          <div key={rec.id} className="record-card">
            <div className="record-header">
              <div>
                <div className="record-date">{rec.date}</div>
                <div className="record-facility">{rec.facility}</div>
              </div>
              <div className="record-diagnosis-code">{rec.diagnosisCode}</div>
            </div>

            <div className="record-body">
              <div className="record-row">
                <span className="record-label">Provider</span>
                <span className="record-value">
                  {rec.provider} (NPI: {rec.providerNPI})
                </span>
              </div>
              <div className="record-row">
                <span className="record-label">Diagnosis</span>
                <span className="record-value">{rec.diagnosis}</span>
              </div>
              {rec.medications.length > 0 && (
                <div className="record-row">
                  <span className="record-label">Medications</span>
                  <span className="record-value">
                    {rec.medications.join("; ")}
                  </span>
                </div>
              )}
              <div className="record-notes">
                <div className="record-label">Clinical Notes</div>
                <p>{rec.notes}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <style>{`
        .records h1 { font-size: 1.5rem; margin-bottom: 24px; }
        .records-list { display: flex; flex-direction: column; gap: 16px; }
        .record-card {
          background: #fff;
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          overflow: hidden;
        }
        .record-header {
          background: #f5f5f5;
          padding: 16px 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid #e0e0e0;
        }
        .record-date { font-weight: 700; }
        .record-facility { font-size: 0.85rem; color: #666; margin-top: 2px; }
        .record-diagnosis-code {
          background: #e3f2fd;
          color: #1565c0;
          padding: 4px 12px;
          border-radius: 4px;
          font-size: 0.85rem;
          font-weight: 600;
          font-family: monospace;
        }
        .record-body { padding: 20px; }
        .record-row {
          display: flex;
          padding: 8px 0;
          border-bottom: 1px solid #f0f0f0;
          font-size: 0.9rem;
        }
        .record-label {
          font-weight: 600;
          color: #555;
          width: 120px;
          flex-shrink: 0;
          font-size: 0.85rem;
        }
        .record-value { flex: 1; }
        .record-notes {
          margin-top: 16px;
          padding-top: 12px;
          border-top: 1px solid #e0e0e0;
        }
        .record-notes p {
          margin: 8px 0 0;
          font-size: 0.9rem;
          line-height: 1.6;
          color: #333;
          background: #fafafa;
          padding: 12px;
          border-radius: 6px;
          border-left: 3px solid #1976d2;
        }
      `}</style>
    </div>
  );
}
