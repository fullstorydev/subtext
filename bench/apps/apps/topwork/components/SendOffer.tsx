import { useState } from "preact/hooks";
import { Freelancer, Job, Contract } from "../types";

interface Props {
  freelancer?: Freelancer;
  jobs: Job[];
  onSendOffer: (contract: Omit<Contract, "id">) => void;
  onCancel: () => void;
}

export function SendOffer({ freelancer, jobs, onSendOffer, onCancel }: Props) {
  const [contractTitle, setContractTitle] = useState("");
  const [selectedJob, setSelectedJob] = useState("");
  const [paymentType, setPaymentType] = useState<"hourly" | "fixed">("hourly");
  const [hourlyRate, setHourlyRate] = useState(freelancer?.hourlyRate || 30);
  const [weeklyLimit, setWeeklyLimit] = useState(40);
  const [fixedPrice, setFixedPrice] = useState(500);
  const [hiringTeam, setHiringTeam] = useState("Shaun VanWeldeen");
  const [description, setDescription] = useState("");
  const [automaticPayment, setAutomaticPayment] = useState(0);
  const [useAutomaticPayment, setUseAutomaticPayment] = useState(false);

  if (!freelancer) {
    return <div>Freelancer not found</div>;
  }

  const handleSubmit = () => {
    const contract: Omit<Contract, "id"> = {
      freelancerId: freelancer.id,
      jobId: selectedJob || jobs[0]?.id || "",
      title: contractTitle || "Contract for " + freelancer.name,
      type: paymentType,
      hourlyRate: paymentType === "hourly" ? hourlyRate : undefined,
      weeklyLimit: paymentType === "hourly" ? weeklyLimit : undefined,
      fixedPrice: paymentType === "fixed" ? fixedPrice : undefined,
      description,
      status: "pending",
      hiringTeam,
      automaticPayment: useAutomaticPayment ? automaticPayment : undefined,
    };
    onSendOffer(contract);
  };

  return (
    <div className="send-offer">
      <div className="offer-container">
        <h1>Send an offer</h1>

        <div className="freelancer-summary">
          <div className="avatar">{freelancer.name.charAt(0)}</div>
          <div>
            <h3>{freelancer.name}</h3>
            <p>{freelancer.title}</p>
          </div>
        </div>

        <form className="offer-form">
          <div className="form-section">
            <label>Choose a job for this contract</label>
            <select
              value={selectedJob}
              onChange={(e: any) => setSelectedJob(e.target.value)}
            >
              <option value="">Select a job</option>
              {jobs.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.title}
                </option>
              ))}
            </select>
          </div>

          <div className="form-section">
            <label>Contract title</label>
            <input
              type="text"
              value={contractTitle}
              onChange={(e: any) => setContractTitle(e.target.value)}
              placeholder="Enter contract title"
            />
          </div>

          <div className="form-section">
            <label>Hiring team</label>
            <select
              value={hiringTeam}
              onChange={(e: any) => setHiringTeam(e.target.value)}
            >
              <option value="Shaun VanWeldeen">Shaun VanWeldeen</option>
              <option value="Microsoft">Microsoft</option>
              <option value="Tech Startup Inc">Tech Startup Inc</option>
            </select>
          </div>

          <div className="form-section">
            <h3>Contract terms</h3>

            <label className="radio-label">
              <input
                type="radio"
                name="payment"
                value="hourly"
                checked={paymentType === "hourly"}
                onChange={() => setPaymentType("hourly")}
              />
              <div>
                <strong>Pay by the hour</strong>
                <p>Pay hourly to easily scale up and down</p>
              </div>
            </label>

            <label className="radio-label">
              <input
                type="radio"
                name="payment"
                value="fixed"
                checked={paymentType === "fixed"}
                onChange={() => setPaymentType("fixed")}
              />
              <div>
                <strong>Pay a fixed price</strong>
                <p>
                  Define payment before work begins and pay only when work is
                  delivered
                </p>
              </div>
            </label>
          </div>

          {paymentType === "hourly" && (
            <div className="form-section payment-details">
              <div className="rate-input">
                <label>Hourly rate</label>
                <div className="input-group">
                  <span className="currency">$</span>
                  <input
                    type="number"
                    value={hourlyRate}
                    onChange={(e: any) => setHourlyRate(Number(e.target.value))}
                  />
                  <span className="suffix">/hr</span>
                </div>
              </div>

              <div className="weekly-limit">
                <label>
                  <input type="checkbox" checked={true} readOnly />
                  Set a weekly limit
                </label>
                <div className="input-group">
                  <input
                    type="number"
                    value={weeklyLimit}
                    onChange={(e: any) =>
                      setWeeklyLimit(Number(e.target.value))
                    }
                  />
                  <span className="suffix">hrs/week</span>
                </div>
              </div>
            </div>
          )}

          {paymentType === "fixed" && (
            <div className="form-section payment-details">
              <label>Pay a fixed price for your project</label>
              <div className="input-group">
                <span className="currency">$</span>
                <input
                  type="number"
                  value={fixedPrice}
                  onChange={(e: any) => setFixedPrice(Number(e.target.value))}
                />
              </div>

              <div className="automatic-payment">
                <label>
                  <input
                    type="checkbox"
                    checked={useAutomaticPayment}
                    onChange={(e: any) =>
                      setUseAutomaticPayment(e.target.checked)
                    }
                  />
                  Add automatic weekly payments
                </label>
                {useAutomaticPayment && (
                  <div className="input-group">
                    <span className="currency">$</span>
                    <input
                      type="number"
                      value={automaticPayment}
                      onChange={(e: any) =>
                        setAutomaticPayment(Number(e.target.value))
                      }
                    />
                    <span className="suffix">/week</span>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="form-section">
            <label>Work description</label>
            <textarea
              value={description}
              onChange={(e: any) => setDescription(e.target.value)}
              placeholder="Describe the work to be done..."
              rows={4}
            />
            <a href="#" className="attach-link">
              Attach a file
            </a>
          </div>

          <div className="form-actions">
            <button type="button" className="cancel-btn" onClick={onCancel}>
              Cancel
            </button>
            <button
              type="button"
              className="continue-btn"
              onClick={handleSubmit}
            >
              Continue
            </button>
          </div>
        </form>

        <div className="faq-section">
          <details>
            <summary>How do hourly contracts work?</summary>
            <p>
              Hourly contracts allow you to pay freelancers for time worked. You
              can set weekly limits and review work logs.
            </p>
          </details>
          <details>
            <summary>How do fixed-price contracts work?</summary>
            <p>
              Fixed-price contracts have set milestones with specific
              deliverables and payments.
            </p>
          </details>
        </div>
      </div>

      <style>{`
        .send-offer {
          max-width: 800px;
          margin: 0 auto;
          padding: 40px 20px;
        }
        
        .offer-container {
          background: white;
          border-radius: 12px;
          padding: 40px;
        }
        
        .send-offer h1 {
          font-size: 28px;
          font-weight: 500;
          margin-bottom: 30px;
        }
        
        .freelancer-summary {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 20px;
          background: #f9f9f9;
          border-radius: 8px;
          margin-bottom: 30px;
        }
        
        .freelancer-summary .avatar {
          width: 48px;
          height: 48px;
          background: #14a800;
          color: white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 600;
          font-size: 18px;
        }
        
        .freelancer-summary h3 {
          margin: 0 0 4px 0;
          font-size: 16px;
        }
        
        .freelancer-summary p {
          margin: 0;
          color: #5e6d55;
          font-size: 14px;
        }
        
        .offer-form {
          display: flex;
          flex-direction: column;
          gap: 30px;
        }
        
        .form-section {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        
        .form-section h3 {
          font-size: 18px;
          font-weight: 500;
          margin: 0;
        }
        
        label {
          font-size: 14px;
          font-weight: 500;
          color: #001e00;
        }
        
        input[type="text"],
        input[type="number"],
        select,
        textarea {
          padding: 12px;
          border: 1px solid #d0d0d0;
          border-radius: 8px;
          font-size: 14px;
          transition: border-color 0.2s;
          background: #fafafa;
        }
        
        input[type="text"]:focus,
        input[type="number"]:focus,
        select:focus,
        textarea:focus {
          outline: none;
          border-color: #14a800;
          background: white;
        }
        
        select {
          cursor: pointer;
        }
        
        .radio-label {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 16px;
          border: 2px solid #e0e0e0;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .radio-label:has(input:checked) {
          border-color: #14a800;
          background: #f0f9f0;
        }
        
        .radio-label input[type="radio"] {
          margin-top: 2px;
        }
        
        .radio-label strong {
          display: block;
          margin-bottom: 4px;
        }
        
        .radio-label p {
          margin: 0;
          font-size: 14px;
          color: #5e6d55;
        }
        
        .payment-details {
          background: #f9f9f9;
          padding: 20px;
          border-radius: 8px;
        }
        
        .input-group {
          display: flex;
          align-items: center;
          gap: 8px;
          background: white;
          border: 1px solid #d0d0d0;
          border-radius: 8px;
          padding: 0 12px;
        }
        
        .input-group input {
          border: none;
          background: none;
          padding: 12px 0;
          flex: 1;
        }
        
        .input-group input:focus {
          outline: none;
        }
        
        .currency {
          color: #5e6d55;
          font-weight: 500;
        }
        
        .suffix {
          color: #5e6d55;
          font-size: 14px;
        }
        
        .rate-input {
          margin-bottom: 20px;
        }
        
        .weekly-limit label,
        .automatic-payment label {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 12px;
          font-weight: normal;
        }
        
        .weekly-limit input[type="checkbox"],
        .automatic-payment input[type="checkbox"] {
          width: 16px;
          height: 16px;
          cursor: pointer;
        }
        
        textarea {
          resize: vertical;
          min-height: 100px;
        }
        
        .attach-link {
          color: #14a800;
          text-decoration: none;
          font-size: 14px;
          font-weight: 500;
        }
        
        .attach-link:hover {
          text-decoration: underline;
        }
        
        .form-actions {
          display: flex;
          gap: 16px;
          justify-content: flex-end;
          margin-top: 20px;
        }
        
        .cancel-btn,
        .continue-btn {
          padding: 12px 24px;
          border-radius: 10px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          border: none;
          font-size: 14px;
        }
        
        .cancel-btn {
          background: white;
          color: #5e6d55;
          border: 1px solid #d0d0d0;
        }
        
        .cancel-btn:hover {
          background: #f9f9f9;
        }
        
        .continue-btn {
          background: #14a800;
          color: white;
        }
        
        .continue-btn:hover {
          background: #12a200;
        }
        
        .faq-section {
          margin-top: 40px;
          padding-top: 40px;
          border-top: 1px solid #e0e0e0;
        }
        
        details {
          margin-bottom: 16px;
        }
        
        summary {
          cursor: pointer;
          font-weight: 500;
          padding: 12px 0;
          list-style: none;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        
        summary::-webkit-details-marker {
          display: none;
        }
        
        summary::after {
          content: "+";
          font-size: 20px;
          color: #5e6d55;
        }
        
        details[open] summary::after {
          content: "-";
        }
        
        details p {
          margin: 0;
          padding: 0 0 16px 0;
          color: #5e6d55;
          line-height: 1.6;
        }
      `}</style>
    </div>
  );
}
