import { JobPost } from "../types";
import { JobPostTitle } from "./JobPostTitle";
import { JobPostSkills } from "./JobPostSkills";
import { JobPostScope } from "./JobPostScope";
import { JobPostBudget } from "./JobPostBudget";
import { JobPostDescription } from "./JobPostDescription";

interface Props {
  jobPost: JobPost;
  onUpdateJobPost: (updates: Partial<JobPost>) => void;
  onBack: () => void;
  onSubmit: () => void;
}

export function JobPostWizard({
  jobPost,
  onUpdateJobPost,
  onBack,
  onSubmit,
}: Props) {
  const currentStep = jobPost.currentStep || "title";

  const getStepNumber = (step: string) => {
    const steps = ["title", "skills", "scope", "budget", "description"];
    return steps.indexOf(step) + 1;
  };

  const handleNext = () => {
    const steps = ["title", "skills", "scope", "budget", "description"];
    const currentIndex = steps.indexOf(currentStep);
    if (currentIndex < steps.length - 1) {
      onUpdateJobPost({ currentStep: steps[currentIndex + 1] as any });
    } else {
      onSubmit();
    }
  };

  const handleBack = () => {
    const steps = ["title", "skills", "scope", "budget", "description"];
    const currentIndex = steps.indexOf(currentStep);
    if (currentIndex > 0) {
      onUpdateJobPost({ currentStep: steps[currentIndex - 1] as any });
    } else {
      onBack();
    }
  };

  return (
    <div className="job-post-wizard">
      <div className="wizard-progress">
        <div className="step-indicator">{getStepNumber(currentStep)}/5</div>
        <h2 className="step-title">Job post</h2>
      </div>

      <div className="wizard-content">
        {currentStep === "title" && (
          <JobPostTitle
            title={jobPost.title}
            onUpdateTitle={(title) => onUpdateJobPost({ title })}
            onNext={handleNext}
            onBack={handleBack}
          />
        )}

        {currentStep === "skills" && (
          <JobPostSkills
            selectedSkills={jobPost.skills}
            onUpdateSkills={(skills) => onUpdateJobPost({ skills })}
            onNext={handleNext}
            onBack={handleBack}
          />
        )}

        {currentStep === "scope" && (
          <JobPostScope
            projectSize={jobPost.projectSize}
            projectDuration={jobPost.projectDuration}
            experienceLevel={jobPost.experienceLevel}
            hireOpportunity={jobPost.hireOpportunity}
            onUpdateScope={(updates) => onUpdateJobPost(updates)}
            onNext={handleNext}
            onBack={handleBack}
          />
        )}

        {currentStep === "budget" && (
          <JobPostBudget
            budgetType={jobPost.budgetType}
            hourlyRateFrom={jobPost.hourlyRateFrom}
            hourlyRateTo={jobPost.hourlyRateTo}
            fixedPrice={jobPost.fixedPrice}
            onUpdateBudget={(updates) => onUpdateJobPost(updates)}
            onNext={handleNext}
            onBack={handleBack}
          />
        )}

        {currentStep === "description" && (
          <JobPostDescription
            description={jobPost.description}
            onUpdateDescription={(description) =>
              onUpdateJobPost({ description })
            }
            onNext={handleNext}
            onBack={handleBack}
          />
        )}
      </div>

      <style>{`
        .job-post-wizard {
          max-width: 800px;
          margin: 0 auto;
          padding: 40px 20px;
        }
        
        .wizard-progress {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-bottom: 40px;
          color: #5e6d55;
        }
        
        .step-indicator {
          font-size: 16px;
          font-weight: 500;
        }
        
        .step-title {
          font-size: 16px;
          font-weight: 400;
          margin: 0;
          color: #5e6d55;
        }
        
        .wizard-content {
          background: white;
          border-radius: 12px;
          padding: 40px;
          min-height: 400px;
        }
      `}</style>
    </div>
  );
}
