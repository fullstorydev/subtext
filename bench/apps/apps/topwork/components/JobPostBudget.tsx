interface Props {
  budgetType: "hourly" | "fixed";
  hourlyRateFrom?: number;
  hourlyRateTo?: number;
  fixedPrice?: number;
  onUpdateBudget: (
    updates: Partial<{
      budgetType: "hourly" | "fixed";
      hourlyRateFrom?: number;
      hourlyRateTo?: number;
      fixedPrice?: number;
    }>,
  ) => void;
  onNext: () => void;
  onBack: () => void;
}

export function JobPostBudget({
  budgetType,
  hourlyRateFrom,
  hourlyRateTo,
  fixedPrice,
  onUpdateBudget,
  onNext,
  onBack,
}: Props) {
  const isHourlyValid =
    budgetType === "hourly" && hourlyRateFrom && hourlyRateTo;
  const isFixedValid = budgetType === "fixed" && fixedPrice;
  const isComplete = isHourlyValid || isFixedValid;

  return (
    <div className="job-post-budget">
      <h1>Tell us about your budget.</h1>
      <p className="subtitle">
        This will help us match you to talent within your range.
      </p>

      <div className="budget-type-selector">
        <button
          className={`budget-type-btn ${budgetType === "hourly" ? "active" : ""}`}
          onClick={() => onUpdateBudget({ budgetType: "hourly" })}
        >
          <div className="budget-type-icon">⏱</div>
          <span>Hourly rate</span>
        </button>

        <button
          className={`budget-type-btn ${budgetType === "fixed" ? "active" : ""}`}
          onClick={() => onUpdateBudget({ budgetType: "fixed" })}
        >
          <div className="budget-type-icon">📝</div>
          <span>Fixed price</span>
        </button>
      </div>

      {budgetType === "hourly" && (
        <div className="hourly-section">
          <div className="rate-inputs">
            <div className="rate-input-group">
              <label>From</label>
              <div className="input-with-suffix">
                <input
                  type="number"
                  min="1"
                  value={hourlyRateFrom || ""}
                  onChange={(e) =>
                    onUpdateBudget({
                      hourlyRateFrom:
                        parseInt((e.target as HTMLInputElement).value) ||
                        undefined,
                    })
                  }
                  placeholder="15"
                />
                <span className="suffix">/hr</span>
              </div>
            </div>

            <div className="rate-input-group">
              <label>To</label>
              <div className="input-with-suffix">
                <input
                  type="number"
                  min="1"
                  value={hourlyRateTo || ""}
                  onChange={(e) =>
                    onUpdateBudget({
                      hourlyRateTo:
                        parseInt((e.target as HTMLInputElement).value) ||
                        undefined,
                    })
                  }
                  placeholder="35"
                />
                <span className="suffix">/hr</span>
              </div>
            </div>
          </div>

          <p className="rate-info">
            This is the average rate for similar projects.
          </p>

          <div className="rate-chart">
            <div className="chart-header">
              <p>
                We've auto-input the rates that some professionals expect to
                charge for Ecommerce Website Development projects like yours,
                but rates vary and are always between you and your freelancer.
              </p>
            </div>
            <div className="chart-visual">
              <div className="chart-bars">
                <div className="bar bar-1" style="height: 40%"></div>
                <div className="bar bar-2" style="height: 70%"></div>
                <div className="bar bar-3" style="height: 100%"></div>
                <div className="bar bar-4" style="height: 90%"></div>
                <div className="bar bar-5" style="height: 60%"></div>
                <div className="bar bar-6" style="height: 30%"></div>
                <div className="bar bar-7" style="height: 15%"></div>
              </div>
              <div className="chart-labels">
                <span>6</span>
                <span>24</span>
                <span>42</span>
                <span>60</span>
                <span>78</span>
              </div>
              <p className="chart-caption">hourly rate (USD)</p>
            </div>
          </div>

          <a href="#" className="rate-link">
            Not ready to set an hourly rate?
          </a>
        </div>
      )}

      {budgetType === "fixed" && (
        <div className="fixed-section">
          <div className="price-input-group">
            <label>Maximum project budget</label>
            <div className="input-with-prefix">
              <span className="prefix">$</span>
              <input
                type="number"
                min="1"
                value={fixedPrice || ""}
                onChange={(e) =>
                  onUpdateBudget({
                    fixedPrice:
                      parseInt((e.target as HTMLInputElement).value) ||
                      undefined,
                  })
                }
                placeholder="5,000"
              />
            </div>
          </div>

          <p className="price-info">
            You will have the option to create milestones which divide your
            project into manageable phases.
          </p>
        </div>
      )}

      <div className="wizard-actions">
        <button className="back-btn" onClick={onBack}>
          Back
        </button>
        <button className="next-btn" onClick={onNext} disabled={!isComplete}>
          Next: Description
        </button>
      </div>

      <style>{`
        .job-post-budget {
          max-width: 700px;
        }
        
        .job-post-budget h1 {
          font-size: 28px;
          font-weight: 500;
          margin-bottom: 8px;
          color: #001e00;
        }
        
        .subtitle {
          font-size: 16px;
          color: #5e6d55;
          margin-bottom: 32px;
        }
        
        .budget-type-selector {
          display: flex;
          gap: 16px;
          margin-bottom: 32px;
        }
        
        .budget-type-btn {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          padding: 24px;
          background: white;
          border: 2px solid #e0e0e0;
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.2s;
          font-size: 16px;
          font-weight: 500;
          color: #001e00;
        }
        
        .budget-type-btn:hover {
          border-color: #14a800;
          background: #f7f7f7;
        }
        
        .budget-type-btn.active {
          border-color: #14a800;
          background: #e7f5e7;
        }
        
        .budget-type-icon {
          font-size: 24px;
        }
        
        .rate-inputs {
          display: flex;
          gap: 24px;
          margin-bottom: 16px;
        }
        
        .rate-input-group, .price-input-group {
          flex: 1;
        }
        
        .rate-input-group label, .price-input-group label {
          display: block;
          font-size: 14px;
          font-weight: 500;
          margin-bottom: 8px;
          color: #001e00;
        }
        
        .input-with-suffix, .input-with-prefix {
          display: flex;
          align-items: center;
          border: 1px solid #d0d0d0;
          border-radius: 8px;
          overflow: hidden;
        }
        
        .input-with-suffix input, .input-with-prefix input {
          flex: 1;
          padding: 12px 16px;
          font-size: 16px;
          border: none;
          outline: none;
        }
        
        .suffix, .prefix {
          padding: 0 16px;
          color: #5e6d55;
          background: #f7f7f7;
          font-size: 16px;
        }
        
        .prefix {
          border-right: 1px solid #d0d0d0;
        }
        
        .suffix {
          border-left: 1px solid #d0d0d0;
        }
        
        .rate-info, .price-info {
          font-size: 14px;
          color: #5e6d55;
          margin-bottom: 24px;
        }
        
        .rate-chart {
          background: #f7f7f7;
          border-radius: 8px;
          padding: 24px;
          margin-bottom: 24px;
        }
        
        .chart-header p {
          font-size: 14px;
          color: #5e6d55;
          margin-bottom: 24px;
          line-height: 1.5;
        }
        
        .chart-visual {
          text-align: center;
        }
        
        .chart-bars {
          display: flex;
          align-items: flex-end;
          justify-content: center;
          height: 120px;
          gap: 8px;
          margin-bottom: 8px;
        }
        
        .bar {
          width: 40px;
          background: #14a800;
          border-radius: 4px 4px 0 0;
        }
        
        .bar-3, .bar-4 {
          background: #108a00;
        }
        
        .bar-1, .bar-2, .bar-5, .bar-6, .bar-7 {
          background: #5cb85c;
        }
        
        .chart-labels {
          display: flex;
          justify-content: space-between;
          max-width: 300px;
          margin: 0 auto 8px;
          font-size: 12px;
          color: #5e6d55;
        }
        
        .chart-caption {
          font-size: 12px;
          color: #5e6d55;
          margin: 0;
        }
        
        .rate-link {
          color: #14a800;
          text-decoration: none;
          font-size: 14px;
          font-weight: 500;
        }
        
        .rate-link:hover {
          text-decoration: underline;
        }
        
        .wizard-actions {
          display: flex;
          justify-content: space-between;
          padding-top: 20px;
          border-top: 1px solid #e0e0e0;
          margin-top: 40px;
        }
        
        .back-btn, .next-btn {
          padding: 12px 24px;
          font-size: 16px;
          font-weight: 500;
          border-radius: 10px;
          cursor: pointer;
          transition: all 0.2s;
          border: none;
        }
        
        .back-btn {
          background: white;
          color: #001e00;
          border: 1px solid #d0d0d0;
        }
        
        .back-btn:hover {
          background: #f7f7f7;
        }
        
        .next-btn {
          background: #14a800;
          color: white;
        }
        
        .next-btn:hover:not(:disabled) {
          background: #108a00;
        }
        
        .next-btn:disabled {
          background: #d0d0d0;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}
