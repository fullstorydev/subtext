interface Props {
  title: string;
  onUpdateTitle: (title: string) => void;
  onNext: () => void;
  onBack: () => void;
}

export function JobPostTitle({ title, onUpdateTitle, onNext, onBack }: Props) {
  const handleNext = () => {
    if (title.trim()) {
      onNext();
    }
  };

  return (
    <div className="job-post-title">
      <h1>Let's start with a strong title.</h1>
      <p className="subtitle">
        This helps your job post stand out to the right candidates. It's the
        first thing they'll see, so make it count!
      </p>

      <div className="form-section">
        <label htmlFor="job-title">Write a title for your job post</label>
        <input
          id="job-title"
          type="text"
          value={title}
          onChange={(e) => onUpdateTitle((e.target as HTMLInputElement).value)}
          placeholder=""
          className="title-input"
          autoFocus
        />
      </div>

      <div className="example-titles">
        <h3>Example titles</h3>
        <ul>
          <li>
            • Build responsive WordPress site with booking/payment functionality
          </li>
          <li>
            • Graphic designer needed to design ad creative for multiple
            campaigns
          </li>
          <li>• Facebook ad specialist needed for product launch</li>
        </ul>
      </div>

      <div className="wizard-actions">
        <button className="back-btn" onClick={onBack}>
          Back
        </button>
        <button
          className="next-btn"
          onClick={handleNext}
          disabled={!title.trim()}
        >
          Next: Skills
        </button>
      </div>

      <style>{`
        .job-post-title {
          max-width: 600px;
        }
        
        .job-post-title h1 {
          font-size: 32px;
          font-weight: 500;
          margin-bottom: 16px;
          color: #001e00;
        }
        
        .subtitle {
          font-size: 16px;
          color: #5e6d55;
          line-height: 1.5;
          margin-bottom: 40px;
        }
        
        .form-section {
          margin-bottom: 40px;
        }
        
        .form-section label {
          display: block;
          font-size: 14px;
          font-weight: 500;
          margin-bottom: 8px;
          color: #001e00;
        }
        
        .title-input {
          width: 100%;
          padding: 12px 16px;
          font-size: 16px;
          border: 1px solid #d0d0d0;
          border-radius: 8px;
          transition: border-color 0.2s;
        }
        
        .title-input:focus {
          outline: none;
          border-color: #14a800;
        }
        
        .example-titles {
          background: #f7f7f7;
          padding: 24px;
          border-radius: 8px;
          margin-bottom: 40px;
        }
        
        .example-titles h3 {
          font-size: 16px;
          font-weight: 500;
          margin-bottom: 16px;
          color: #001e00;
        }
        
        .example-titles ul {
          list-style: none;
          padding: 0;
          margin: 0;
        }
        
        .example-titles li {
          font-size: 14px;
          color: #5e6d55;
          line-height: 1.8;
        }
        
        .wizard-actions {
          display: flex;
          justify-content: space-between;
          padding-top: 20px;
          border-top: 1px solid #e0e0e0;
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
