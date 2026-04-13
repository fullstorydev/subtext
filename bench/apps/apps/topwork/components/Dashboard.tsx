import { Freelancer, Job } from "../types";

interface Props {
  freelancers: Freelancer[];
  jobs: Job[];
  onSelectFreelancer: (id: string) => void;
  onPostJob: () => void;
}

export function Dashboard({
  freelancers,
  jobs,
  onSelectFreelancer,
  onPostJob,
}: Props) {
  return (
    <div className="dashboard">
      <section className="jobs-section">
        <div className="section-header">
          <h2>Your jobs</h2>
          <div className="section-actions">
            <button className="post-job-btn-small" onClick={onPostJob}>
              + Post a job
            </button>
            <a href="#" className="view-all">
              View all postings
            </a>
          </div>
        </div>

        <div className="jobs-grid">
          {jobs.map((job) => (
            <div key={job.id} className="job-card">
              <h3>{job.title}</h3>
              <div className="job-meta">
                <span className="posted">{job.posted}</span>
                <span className="proposals">{job.proposals} proposals</span>
              </div>
              <div className="job-status">
                <span className={`status ${job.status}`}>{job.status}</span>
              </div>
            </div>
          ))}

          {jobs.length === 0 && (
            <div className="empty-state">
              <p>No active jobs</p>
              <button className="post-job-btn" onClick={onPostJob}>
                Post your first job
              </button>
            </div>
          )}
        </div>
      </section>

      <section className="hires-section">
        <div className="section-header">
          <h2>Your hires</h2>
          <a href="#" className="view-all">
            View all hires
          </a>
        </div>

        <div className="freelancers-grid">
          {freelancers.map((freelancer) => (
            <div
              key={freelancer.id}
              className="freelancer-card"
              onClick={() => onSelectFreelancer(freelancer.id)}
            >
              <div className="freelancer-header">
                <div className="avatar">{freelancer.name.charAt(0)}</div>
                <div className="freelancer-info">
                  <h3>{freelancer.name}</h3>
                  <p className="title">{freelancer.title}</p>
                </div>
              </div>

              <div className="freelancer-meta">
                <div className="location">{freelancer.location}</div>
                <div className="rate">${freelancer.hourlyRate}/hr</div>
              </div>

              <div className="freelancer-stats">
                <span className="earnings">{freelancer.earnings} earned</span>
                <span className="rating">★ {freelancer.rating}</span>
              </div>

              <div className="freelancer-skills">
                {freelancer.skills.slice(0, 3).map((skill) => (
                  <span key={skill} className="skill-tag">
                    {skill}
                  </span>
                ))}
              </div>

              {freelancer.available && (
                <button className="rehire-btn">Available for rehire</button>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="goals-section">
        <h2>Review your project's goals</h2>
        <p>Talk to our experts to clarify your project needs</p>

        <div className="experts-grid">
          <div className="expert-card">
            <div className="expert-icon">💼</div>
            <h3>Project Strategy</h3>
            <p>Define clear objectives and milestones</p>
            <a href="#">Book a consultation</a>
          </div>

          <div className="expert-card">
            <div className="expert-icon">👥</div>
            <h3>Talent Matching</h3>
            <p>Find the perfect freelancer for your needs</p>
            <a href="#">Book a consultation</a>
          </div>

          <div className="expert-card">
            <div className="expert-icon">📊</div>
            <h3>Budget Planning</h3>
            <p>Optimize your project budget</p>
            <a href="#">Book a consultation</a>
          </div>
        </div>
      </section>

      <style>{`
        .dashboard {
          padding: 20px;
        }
        
        section {
          margin-bottom: 40px;
        }
        
        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }
        
        .section-header h2 {
          font-size: 24px;
          font-weight: 500;
          margin: 0;
        }
        
        .section-actions {
          display: flex;
          align-items: center;
          gap: 16px;
        }
        
        .post-job-btn-small {
          background: #14a800;
          color: white;
          border: none;
          padding: 6px 16px;
          border-radius: 20px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.2s;
        }
        
        .post-job-btn-small:hover {
          background: #108a00;
        }
        
        .view-all {
          color: #14a800;
          text-decoration: none;
          font-size: 14px;
        }
        
        .view-all:hover {
          text-decoration: underline;
        }
        
        .jobs-grid, .freelancers-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 20px;
        }
        
        .job-card, .freelancer-card {
          background: white;
          border-radius: 12px;
          padding: 20px;
          border: 1px solid #e0e0e0;
          transition: all 0.2s;
        }
        
        .freelancer-card {
          cursor: pointer;
        }
        
        .freelancer-card:hover {
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
          transform: translateY(-2px);
        }
        
        .job-card h3, .freelancer-header h3 {
          font-size: 16px;
          font-weight: 500;
          margin: 0 0 8px 0;
        }
        
        .job-meta {
          display: flex;
          gap: 12px;
          font-size: 14px;
          color: #5e6d55;
          margin-bottom: 12px;
        }
        
        .job-status .status {
          display: inline-block;
          padding: 4px 12px;
          border-radius: 16px;
          font-size: 12px;
          font-weight: 500;
          background: #f2f2f2;
          color: #5e6d55;
        }
        
        .job-status .status.open {
          background: #e7f5e7;
          color: #14a800;
        }
        
        .freelancer-header {
          display: flex;
          gap: 12px;
          margin-bottom: 16px;
        }
        
        .avatar {
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
        
        .freelancer-info .title {
          font-size: 14px;
          color: #5e6d55;
          margin: 4px 0 0 0;
        }
        
        .freelancer-meta {
          display: flex;
          justify-content: space-between;
          font-size: 14px;
          margin-bottom: 12px;
        }
        
        .location {
          color: #5e6d55;
        }
        
        .rate {
          font-weight: 600;
        }
        
        .freelancer-stats {
          display: flex;
          gap: 16px;
          font-size: 14px;
          color: #5e6d55;
          margin-bottom: 12px;
        }
        
        .rating {
          color: #ff9800;
        }
        
        .freelancer-skills {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 16px;
        }
        
        .skill-tag {
          padding: 4px 12px;
          background: #f2f2f2;
          border-radius: 16px;
          font-size: 12px;
          color: #5e6d55;
        }
        
        .rehire-btn {
          width: 100%;
          padding: 8px 16px;
          background: white;
          border: 2px solid #14a800;
          color: #14a800;
          border-radius: 10px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .rehire-btn:hover {
          background: #14a800;
          color: white;
        }
        
        .empty-state {
          grid-column: 1 / -1;
          text-align: center;
          padding: 40px;
          background: white;
          border-radius: 12px;
          border: 1px solid #e0e0e0;
        }
        
        .empty-state p {
          color: #5e6d55;
          margin-bottom: 20px;
        }
        
        .post-job-btn {
          background: #14a800;
          color: white;
          border: none;
          padding: 10px 24px;
          border-radius: 10px;
          font-weight: 500;
          cursor: pointer;
        }
        
        .goals-section {
          background: white;
          padding: 40px;
          border-radius: 12px;
        }
        
        .goals-section h2 {
          font-size: 24px;
          margin-bottom: 8px;
        }
        
        .goals-section > p {
          color: #5e6d55;
          margin-bottom: 30px;
        }
        
        .experts-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 20px;
        }
        
        .expert-card {
          padding: 24px;
          border: 1px solid #e0e0e0;
          border-radius: 12px;
          text-align: center;
        }
        
        .expert-icon {
          font-size: 48px;
          margin-bottom: 16px;
        }
        
        .expert-card h3 {
          font-size: 18px;
          margin-bottom: 8px;
        }
        
        .expert-card p {
          color: #5e6d55;
          font-size: 14px;
          margin-bottom: 16px;
        }
        
        .expert-card a {
          color: #14a800;
          text-decoration: none;
          font-weight: 500;
        }
      `}</style>
    </div>
  );
}
