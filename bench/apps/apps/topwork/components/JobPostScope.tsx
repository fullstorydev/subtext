interface Props {
  projectSize: "large" | "medium" | "small";
  projectDuration: "more_than_6_months" | "3_to_6_months" | "1_to_3_months";
  experienceLevel: "entry" | "intermediate" | "expert";
  hireOpportunity: boolean;
  onUpdateScope: (
    updates: Partial<{
      projectSize: "large" | "medium" | "small";
      projectDuration: "more_than_6_months" | "3_to_6_months" | "1_to_3_months";
      experienceLevel: "entry" | "intermediate" | "expert";
      hireOpportunity: boolean;
    }>,
  ) => void;
  onNext: () => void;
  onBack: () => void;
}

export function JobPostScope({
  projectSize,
  projectDuration,
  experienceLevel,
  hireOpportunity,
  onUpdateScope,
  onNext,
  onBack,
}: Props) {
  const isComplete =
    projectSize &&
    projectDuration &&
    experienceLevel &&
    hireOpportunity !== undefined;

  return (
    <div className="job-post-scope">
      <h1>Next, estimate the scope of your work.</h1>
      <p className="subtitle">
        Consider the size of your project and the time it will take.
      </p>

      <div className="scope-section">
        <h3>Estimate the size of your project</h3>
        <div className="radio-group">
          <label className="radio-option">
            <input
              type="radio"
              name="projectSize"
              value="large"
              checked={projectSize === "large"}
              onChange={() => onUpdateScope({ projectSize: "large" })}
            />
            <div className="radio-content">
              <span className="radio-label">Large</span>
              <span className="radio-description">
                Longer term or complex initiatives (ex. design and build a full
                website)
              </span>
            </div>
          </label>

          <label className="radio-option">
            <input
              type="radio"
              name="projectSize"
              value="medium"
              checked={projectSize === "medium"}
              onChange={() => onUpdateScope({ projectSize: "medium" })}
            />
            <div className="radio-content">
              <span className="radio-label">Medium</span>
              <span className="radio-description">
                Well-defined projects (ex. a landing page)
              </span>
            </div>
          </label>

          <label className="radio-option">
            <input
              type="radio"
              name="projectSize"
              value="small"
              checked={projectSize === "small"}
              onChange={() => onUpdateScope({ projectSize: "small" })}
            />
            <div className="radio-content">
              <span className="radio-label">Small</span>
              <span className="radio-description">
                Quick and straightforward tasks (ex. update text and images on a
                webpage)
              </span>
            </div>
          </label>
        </div>
      </div>

      <div className="scope-section">
        <h3>How long will your work take?</h3>
        <div className="radio-group">
          <label className="radio-option">
            <input
              type="radio"
              name="duration"
              value="more_than_6_months"
              checked={projectDuration === "more_than_6_months"}
              onChange={() =>
                onUpdateScope({ projectDuration: "more_than_6_months" })
              }
            />
            <span className="radio-label">More than 6 months</span>
          </label>

          <label className="radio-option">
            <input
              type="radio"
              name="duration"
              value="3_to_6_months"
              checked={projectDuration === "3_to_6_months"}
              onChange={() =>
                onUpdateScope({ projectDuration: "3_to_6_months" })
              }
            />
            <span className="radio-label">3 to 6 months</span>
          </label>

          <label className="radio-option">
            <input
              type="radio"
              name="duration"
              value="1_to_3_months"
              checked={projectDuration === "1_to_3_months"}
              onChange={() =>
                onUpdateScope({ projectDuration: "1_to_3_months" })
              }
            />
            <span className="radio-label">1 to 3 months</span>
          </label>
        </div>
      </div>

      <div className="scope-section">
        <h3>What level of experience will it need?</h3>
        <p className="section-subtitle">
          This won't restrict any proposals, but helps match expertise to your
          budget.
        </p>
        <div className="radio-group">
          <label className="radio-option">
            <input
              type="radio"
              name="experience"
              value="entry"
              checked={experienceLevel === "entry"}
              onChange={() => onUpdateScope({ experienceLevel: "entry" })}
            />
            <div className="radio-content">
              <span className="radio-label">Entry</span>
              <span className="radio-description">
                Looking for someone relatively new to this field
              </span>
            </div>
          </label>

          <label className="radio-option">
            <input
              type="radio"
              name="experience"
              value="intermediate"
              checked={experienceLevel === "intermediate"}
              onChange={() =>
                onUpdateScope({ experienceLevel: "intermediate" })
              }
            />
            <div className="radio-content">
              <span className="radio-label">Intermediate</span>
              <span className="radio-description">
                Looking for substantial experience in this field
              </span>
            </div>
          </label>

          <label className="radio-option">
            <input
              type="radio"
              name="experience"
              value="expert"
              checked={experienceLevel === "expert"}
              onChange={() => onUpdateScope({ experienceLevel: "expert" })}
            />
            <div className="radio-content">
              <span className="radio-label">Expert</span>
              <span className="radio-description">
                Looking for comprehensive and deep expertise in this field
              </span>
            </div>
          </label>
        </div>
      </div>

      <div className="scope-section">
        <h3>Is this job a contract-to-hire opportunity?</h3>
        <p className="section-subtitle">Yes, this could become full time</p>
        <div className="radio-group">
          <label className="radio-option">
            <input
              type="radio"
              name="hire"
              value="yes"
              checked={hireOpportunity === true}
              onChange={() => onUpdateScope({ hireOpportunity: true })}
            />
            <span className="radio-label">
              After a trial period, you can pay a one-time fee to convert the
              contract.
            </span>
          </label>

          <label className="radio-option">
            <input
              type="radio"
              name="hire"
              value="no"
              checked={hireOpportunity === false}
              onChange={() => onUpdateScope({ hireOpportunity: false })}
            />
            <span className="radio-label">No, not at this time</span>
          </label>
        </div>
      </div>

      <div className="wizard-actions">
        <button className="back-btn" onClick={onBack}>
          Back
        </button>
        <button className="next-btn" onClick={onNext} disabled={!isComplete}>
          Next: Budget
        </button>
      </div>

      <style>{`
        .job-post-scope {
          max-width: 700px;
        }
        
        .job-post-scope h1 {
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
        
        .scope-section {
          margin-bottom: 40px;
        }
        
        .scope-section h3 {
          font-size: 18px;
          font-weight: 500;
          margin-bottom: 8px;
          color: #001e00;
        }
        
        .section-subtitle {
          font-size: 14px;
          color: #5e6d55;
          margin-bottom: 16px;
        }
        
        .radio-group {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        
        .radio-option {
          display: flex;
          align-items: flex-start;
          cursor: pointer;
          padding: 16px;
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          transition: all 0.2s;
        }
        
        .radio-option:hover {
          background: #f7f7f7;
        }
        
        .radio-option input[type="radio"] {
          margin-right: 12px;
          margin-top: 2px;
          flex-shrink: 0;
        }
        
        .radio-content {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        
        .radio-label {
          font-size: 16px;
          font-weight: 500;
          color: #001e00;
        }
        
        .radio-description {
          font-size: 14px;
          color: #5e6d55;
          line-height: 1.4;
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
