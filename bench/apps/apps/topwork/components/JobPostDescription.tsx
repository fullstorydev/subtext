interface Props {
  description: string;
  onUpdateDescription: (description: string) => void;
  onNext: () => void;
  onBack: () => void;
}

export function JobPostDescription({
  description,
  onUpdateDescription,
  onNext,
  onBack,
}: Props) {
  const characterCount = description.length;
  const maxCharacters = 50000;

  return (
    <div className="job-post-description">
      <h1>Start the conversation.</h1>
      <div className="talent-looking-for">
        <p>Talent are looking for:</p>
        <ul>
          <li>• Clear expectations about your task or deliverables</li>
          <li>• The skills required for your work</li>
          <li>• Good communication</li>
          <li>• Details about how you or your team like to work</li>
        </ul>
      </div>

      <div className="description-section">
        <label htmlFor="description">Describe what you need</label>
        <textarea
          id="description"
          value={description}
          onChange={(e) =>
            onUpdateDescription((e.target as HTMLTextAreaElement).value)
          }
          placeholder="Already have a description? Paste it here!"
          rows={10}
          className="description-textarea"
        />
        <div className="character-count">
          {characterCount}/{maxCharacters} characters
        </div>
      </div>

      <div className="help-section">
        <h3>Need help?</h3>
        <a href="#" className="help-link">
          See examples of effective descriptions
        </a>
      </div>

      <div className="attachment-section">
        <button className="attach-btn">📎 Attach file</button>
        <p className="file-size-info">Max file size: 100 MB</p>
      </div>

      <div className="wizard-actions">
        <button className="back-btn" onClick={onBack}>
          Back
        </button>
        <button
          className="submit-btn"
          onClick={onNext}
          disabled={!description.trim()}
        >
          Submit Job Post
        </button>
      </div>

      <style>{`
        .job-post-description {
          max-width: 700px;
        }
        
        .job-post-description h1 {
          font-size: 28px;
          font-weight: 500;
          margin-bottom: 24px;
          color: #001e00;
        }
        
        .talent-looking-for {
          background: #f7f7f7;
          padding: 24px;
          border-radius: 8px;
          margin-bottom: 32px;
        }
        
        .talent-looking-for p {
          font-size: 16px;
          font-weight: 500;
          margin-bottom: 12px;
          color: #001e00;
        }
        
        .talent-looking-for ul {
          list-style: none;
          padding: 0;
          margin: 0;
        }
        
        .talent-looking-for li {
          font-size: 14px;
          color: #5e6d55;
          line-height: 1.8;
        }
        
        .description-section {
          margin-bottom: 24px;
        }
        
        .description-section label {
          display: block;
          font-size: 16px;
          font-weight: 500;
          margin-bottom: 8px;
          color: #001e00;
        }
        
        .description-textarea {
          width: 100%;
          padding: 16px;
          font-size: 16px;
          font-family: inherit;
          border: 1px solid #d0d0d0;
          border-radius: 8px;
          resize: vertical;
          min-height: 200px;
          transition: border-color 0.2s;
        }
        
        .description-textarea:focus {
          outline: none;
          border-color: #14a800;
        }
        
        .character-count {
          text-align: right;
          font-size: 12px;
          color: #5e6d55;
          margin-top: 4px;
        }
        
        .help-section {
          margin-bottom: 24px;
        }
        
        .help-section h3 {
          font-size: 16px;
          font-weight: 500;
          margin-bottom: 8px;
          color: #001e00;
        }
        
        .help-link {
          color: #14a800;
          text-decoration: none;
          font-size: 14px;
          font-weight: 500;
        }
        
        .help-link:hover {
          text-decoration: underline;
        }
        
        .attachment-section {
          margin-bottom: 40px;
        }
        
        .attach-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 20px;
          background: white;
          border: 2px solid #14a800;
          color: #14a800;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .attach-btn:hover {
          background: #e7f5e7;
        }
        
        .file-size-info {
          font-size: 12px;
          color: #5e6d55;
          margin-top: 8px;
        }
        
        .wizard-actions {
          display: flex;
          justify-content: space-between;
          padding-top: 20px;
          border-top: 1px solid #e0e0e0;
        }
        
        .back-btn, .submit-btn {
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
        
        .submit-btn {
          background: #14a800;
          color: white;
        }
        
        .submit-btn:hover:not(:disabled) {
          background: #108a00;
        }
        
        .submit-btn:disabled {
          background: #d0d0d0;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}
