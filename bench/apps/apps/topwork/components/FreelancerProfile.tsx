import { useState } from "preact/hooks";
import { Freelancer } from "../types";

interface Props {
  freelancer?: Freelancer;
  onHire: (id: string) => void;
  onMessage: (id: string) => void;
}

export function FreelancerProfile({ freelancer, onHire, onMessage }: Props) {
  const [showJobDetails, setShowJobDetails] = useState(false);
  const [selectedJob, setSelectedJob] = useState<any>(null);

  if (!freelancer) {
    return <div>Freelancer not found</div>;
  }

  return (
    <div className="freelancer-profile">
      <div className="profile-container">
        <aside className="profile-sidebar">
          <div className="profile-header">
            <div className="avatar-large">{freelancer.name.charAt(0)}</div>
            <h1>{freelancer.name}</h1>
            <p className="location">{freelancer.location}</p>

            <div className="action-buttons">
              <button
                className="hire-btn"
                onClick={() => onHire(freelancer.id)}
              >
                Hire
              </button>
              <button
                className="message-btn"
                onClick={() => onMessage(freelancer.id)}
              >
                Message
              </button>
              <button className="share-btn">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                >
                  <path d="M11 2.5a2.5 2.5 0 11.603 1.628l-4.718 2.359a2.5 2.5 0 010 1.026l4.718 2.359A2.5 2.5 0 1112.5 9.5a2.5 2.5 0 01-.131.586L7.65 7.727a2.5 2.5 0 010-1.454l4.718-2.359A2.499 2.499 0 0111 2.5z" />
                </svg>
                Share
              </button>
            </div>
          </div>

          <div className="profile-section">
            <h3>Stats</h3>
            <div className="stats-grid">
              <div className="stat">
                <div className="stat-value">{freelancer.earnings}</div>
                <div className="stat-label">Total earned</div>
              </div>
              <div className="stat">
                <div className="stat-value">{freelancer.jobsCompleted}</div>
                <div className="stat-label">Jobs</div>
              </div>
              <div className="stat">
                <div className="stat-value">{freelancer.hoursWorked}</div>
                <div className="stat-label">Hours</div>
              </div>
            </div>
          </div>

          <div className="profile-section">
            <div className="rate-info">
              <span className="rate">${freelancer.hourlyRate}/hr</span>
              <span className="rating">★ {freelancer.rating}</span>
            </div>
          </div>

          <div className="profile-section">
            <h3>Availability</h3>
            <p className="availability">
              {freelancer.available ? "Available now" : "Not available"}
            </p>
          </div>
        </aside>

        <main className="profile-main">
          <section className="section">
            <h2>{freelancer.title}</h2>
            <p className="description">{freelancer.description}</p>
          </section>

          <section className="section">
            <h2>Skills</h2>
            <div className="skills-list">
              {freelancer.skills.map((skill) => (
                <span key={skill} className="skill-tag">
                  {skill}
                </span>
              ))}
            </div>
          </section>

          <section className="section">
            <h2>Employment history</h2>
            <div className="employment-list">
              {freelancer.employmentHistory.map((job) => (
                <div
                  key={job.id}
                  className="employment-item"
                  onClick={() => {
                    setSelectedJob(job);
                    setShowJobDetails(true);
                  }}
                >
                  <h3>{job.title}</h3>
                  <div className="employment-meta">
                    <span className="company">{job.company}</span>
                    <span className="dates">
                      {job.startDate} - {job.endDate || "Present"}
                    </span>
                  </div>
                  {job.rating && (
                    <div className="employment-rating">
                      <span className="stars">★ {job.rating}</span>
                      {job.feedback && (
                        <p className="feedback">"{job.feedback}"</p>
                      )}
                    </div>
                  )}
                  <p className="employment-description">{job.description}</p>
                </div>
              ))}
            </div>
          </section>

          {freelancer.education.length > 0 && (
            <section className="section">
              <h2>Education</h2>
              <div className="education-list">
                {freelancer.education.map((edu) => (
                  <div key={edu.id} className="education-item">
                    <h3>
                      {edu.degree} in {edu.field}
                    </h3>
                    <p className="school">{edu.school}</p>
                    <p className="years">
                      {edu.startYear} - {edu.endYear}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </main>
      </div>

      {showJobDetails && selectedJob && (
        <div className="modal-overlay" onClick={() => setShowJobDetails(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{selectedJob.title}</h2>
              <button
                className="close-btn"
                onClick={() => setShowJobDetails(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-content">
              <div className="job-info-section">
                <div className="job-header-info">
                  <p className="job-type">
                    Web, Mobile & Software Dev | Jan 1, 2023 - Feb 15, 2023
                  </p>
                  <p className="job-duration">120 hours</p>
                  <p className="job-rate">$30.00 / hr</p>
                  <p className="job-earned">$10800 earned</p>
                </div>

                <h3>Job feedback</h3>

                <div className="feedback-section">
                  <h4>Client's feedback to the client</h4>
                  <div className="rating-section">
                    {selectedJob.rating && (
                      <div className="overall-rating">
                        <span className="rating-stars">★★★★★</span>
                        <span className="rating-value">
                          {selectedJob.rating}
                        </span>
                      </div>
                    )}
                    <p className="feedback-text">
                      {selectedJob.feedback ||
                        '"John was fantastic to work with. He delivered high-quality code and was very communicative throughout the project."'}
                    </p>
                  </div>

                  <div className="skill-ratings">
                    <div className="skill-rating-row">
                      <span className="skill-label">Skills</span>
                      <div className="rating-bar">
                        <span className="rating-value">5</span>
                        <span className="rating-stars">★★★★★</span>
                      </div>
                    </div>
                    <div className="skill-rating-row">
                      <span className="skill-label">Quality</span>
                      <div className="rating-bar">
                        <span className="rating-value">5</span>
                        <span className="rating-stars">★★★★★</span>
                      </div>
                    </div>
                    <div className="skill-rating-row">
                      <span className="skill-label">Availability</span>
                      <div className="rating-bar">
                        <span className="rating-value">4.5</span>
                        <span className="rating-stars">★★★★☆</span>
                      </div>
                    </div>
                    <div className="skill-rating-row">
                      <span className="skill-label">Deadlines</span>
                      <div className="rating-bar">
                        <span className="rating-value">5.5</span>
                        <span className="rating-stars">★★★★★</span>
                      </div>
                    </div>
                    <div className="skill-rating-row">
                      <span className="skill-label">Communication</span>
                      <div className="rating-bar">
                        <span className="rating-value">5</span>
                        <span className="rating-stars">★★★★★</span>
                      </div>
                    </div>
                    <div className="skill-rating-row">
                      <span className="skill-label">Cooperation</span>
                      <div className="rating-bar">
                        <span className="rating-value">5</span>
                        <span className="rating-stars">★★★★★</span>
                      </div>
                    </div>
                  </div>

                  <h4>Freelancer's feedback to the client</h4>
                  <div className="rating-section">
                    <div className="overall-rating">
                      <span className="rating-stars">★★★★★</span>
                      <span className="rating-value">4.9</span>
                    </div>
                    <p className="feedback-text">
                      "The client was very supportive and provided clear
                      requirements. It was a great experience working on this
                      project."
                    </p>
                  </div>
                </div>

                <h3>Job feedback</h3>
                <p className="job-description">{selectedJob.description}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .freelancer-profile {
          background: white;
          min-height: calc(100vh - 80px);
        }
        
        .profile-container {
          max-width: 1200px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: 300px 1fr;
          gap: 40px;
          padding: 40px 20px;
        }
        
        .profile-sidebar {
          position: sticky;
          top: 100px;
          height: fit-content;
        }
        
        .profile-header {
          text-align: center;
          padding-bottom: 20px;
          border-bottom: 1px solid #e0e0e0;
        }
        
        .avatar-large {
          width: 100px;
          height: 100px;
          background: #14a800;
          color: white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 36px;
          font-weight: 600;
          margin: 0 auto 16px;
        }
        
        .profile-header h1 {
          font-size: 24px;
          font-weight: 500;
          margin: 0 0 8px 0;
        }
        
        .location {
          color: #5e6d55;
          margin-bottom: 20px;
        }
        
        .action-buttons {
          display: flex;
          gap: 8px;
          flex-direction: column;
        }
        
        .hire-btn, .message-btn, .share-btn {
          padding: 10px 20px;
          border-radius: 10px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          border: none;
        }
        
        .hire-btn {
          background: #14a800;
          color: white;
        }
        
        .hire-btn:hover {
          background: #12a200;
        }
        
        .message-btn {
          background: white;
          color: #14a800;
          border: 2px solid #14a800;
        }
        
        .message-btn:hover {
          background: #f0f9f0;
        }
        
        .share-btn {
          background: #f2f2f2;
          color: #5e6d55;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }
        
        .share-btn:hover {
          background: #e0e0e0;
        }
        
        .profile-section {
          padding: 20px 0;
          border-bottom: 1px solid #e0e0e0;
        }
        
        .profile-section:last-child {
          border-bottom: none;
        }
        
        .profile-section h3 {
          font-size: 16px;
          font-weight: 500;
          margin-bottom: 12px;
        }
        
        .stats-grid {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 16px;
          text-align: center;
        }
        
        .stat-value {
          font-size: 18px;
          font-weight: 600;
          color: #001e00;
        }
        
        .stat-label {
          font-size: 12px;
          color: #5e6d55;
          margin-top: 4px;
        }
        
        .rate-info {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        
        .rate {
          font-size: 24px;
          font-weight: 600;
        }
        
        .rating {
          color: #ff9800;
          font-size: 16px;
        }
        
        .availability {
          color: #14a800;
          font-weight: 500;
        }
        
        .profile-main {
          background: white;
        }
        
        .section {
          padding: 30px 0;
          border-bottom: 1px solid #e0e0e0;
        }
        
        .section:last-child {
          border-bottom: none;
        }
        
        .section h2 {
          font-size: 20px;
          font-weight: 500;
          margin-bottom: 16px;
        }
        
        .description {
          line-height: 1.6;
          color: #333;
        }
        
        .skills-list {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        
        .skill-tag {
          padding: 6px 16px;
          background: #f2f2f2;
          border-radius: 20px;
          font-size: 14px;
          color: #5e6d55;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .skill-tag:hover {
          background: #e0e0e0;
        }
        
        .employment-list {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }
        
        .employment-item {
          padding: 20px;
          border: 1px solid #e0e0e0;
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .employment-item:hover {
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }
        
        .employment-item h3 {
          font-size: 16px;
          font-weight: 500;
          margin-bottom: 8px;
          color: #14a800;
        }
        
        .employment-meta {
          display: flex;
          gap: 16px;
          font-size: 14px;
          color: #5e6d55;
          margin-bottom: 12px;
        }
        
        .employment-rating {
          margin-bottom: 12px;
        }
        
        .stars {
          color: #ff9800;
          font-weight: 500;
        }
        
        .feedback {
          font-style: italic;
          color: #5e6d55;
          margin-top: 4px;
        }
        
        .employment-description {
          line-height: 1.6;
          color: #333;
        }
        
        .education-item {
          padding: 16px 0;
          border-bottom: 1px solid #f0f0f0;
        }
        
        .education-item:last-child {
          border-bottom: none;
        }
        
        .education-item h3 {
          font-size: 16px;
          font-weight: 500;
          margin-bottom: 4px;
        }
        
        .school {
          color: #5e6d55;
          margin-bottom: 4px;
        }
        
        .years {
          font-size: 14px;
          color: #5e6d55;
        }
        
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }
        
        .modal {
          background: white;
          border-radius: 12px;
          max-width: 700px;
          width: 90%;
          max-height: 80vh;
          overflow-y: auto;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
        }
        
        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px 24px;
          border-bottom: 1px solid #e0e0e0;
        }
        
        .modal-header h2 {
          font-size: 20px;
          font-weight: 500;
          margin: 0;
        }
        
        .close-btn {
          background: none;
          border: none;
          font-size: 28px;
          line-height: 1;
          cursor: pointer;
          color: #5e6d55;
          padding: 0;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .close-btn:hover {
          color: #001e00;
        }
        
        .modal-content {
          padding: 24px;
        }
        
        .job-header-info {
          margin-bottom: 24px;
        }
        
        .job-header-info p {
          margin: 4px 0;
          color: #5e6d55;
          font-size: 14px;
        }
        
        .job-type {
          color: #001e00 !important;
          font-weight: 500;
        }
        
        .job-info-section h3 {
          font-size: 18px;
          font-weight: 500;
          margin: 24px 0 16px 0;
          color: #001e00;
        }
        
        .job-info-section h4 {
          font-size: 16px;
          font-weight: 500;
          margin: 20px 0 12px 0;
          color: #001e00;
        }
        
        .rating-section {
          margin-bottom: 20px;
        }
        
        .overall-rating {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;
        }
        
        .rating-stars {
          color: #ff9800;
          font-size: 16px;
        }
        
        .rating-value {
          font-weight: 600;
          color: #001e00;
        }
        
        .feedback-text {
          font-style: italic;
          color: #5e6d55;
          line-height: 1.6;
          margin: 8px 0;
        }
        
        .skill-ratings {
          margin: 16px 0;
        }
        
        .skill-rating-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 0;
          border-bottom: 1px solid #f0f0f0;
        }
        
        .skill-rating-row:last-child {
          border-bottom: none;
        }
        
        .skill-label {
          font-size: 14px;
          color: #5e6d55;
        }
        
        .rating-bar {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        
        .job-description {
          line-height: 1.6;
          color: #333;
          margin-top: 12px;
        }
      `}</style>
    </div>
  );
}
