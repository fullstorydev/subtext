import { useState } from "preact/hooks";

interface Props {
  selectedSkills: string[];
  onUpdateSkills: (skills: string[]) => void;
  onNext: () => void;
  onBack: () => void;
}

const popularSkills = {
  "Software Development": [
    "JavaScript",
    "TypeScript",
    "Python",
    "Java",
    "C#",
    "C++",
    "Ruby",
    "Go",
    "Swift",
    "Kotlin",
    "Objective-C",
    "PHP",
    "HTML",
    "CSS",
    "React",
    "Angular",
    "Vue.js",
    "Node.js",
    "Django",
    "Flask",
  ],
};

export function JobPostSkills({
  selectedSkills,
  onUpdateSkills,
  onNext,
  onBack,
}: Props) {
  const [searchQuery, setSearchQuery] = useState("");
  const [showCustomSkill, setShowCustomSkill] = useState(false);

  const handleAddSkill = (skill: string) => {
    if (!selectedSkills.includes(skill)) {
      onUpdateSkills([...selectedSkills, skill]);
    }
    setSearchQuery("");
    setShowCustomSkill(false);
  };

  const handleRemoveSkill = (skill: string) => {
    onUpdateSkills(selectedSkills.filter((s) => s !== skill));
  };

  const handleSearch = (e: Event) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      handleAddSkill(searchQuery.trim());
    }
  };

  const filteredSkills = Object.entries(popularSkills).reduce(
    (acc, [category, skills]) => {
      const filtered = skills.filter(
        (skill) =>
          !selectedSkills.includes(skill) &&
          skill.toLowerCase().includes(searchQuery.toLowerCase()),
      );
      if (filtered.length > 0) {
        acc[category] = filtered;
      }
      return acc;
    },
    {} as Record<string, string[]>,
  );

  const showNoResults =
    searchQuery &&
    Object.keys(filteredSkills).length === 0 &&
    !selectedSkills.some((s) =>
      s.toLowerCase().includes(searchQuery.toLowerCase()),
    );

  return (
    <div className="job-post-skills">
      <h1>What are the main skills required for your work?</h1>
      <p className="subtitle">
        Consider the size of your project and the time it will take.
      </p>

      <div className="search-section">
        <h3>Search skills or add your own</h3>
        <form onSubmit={handleSearch} className="search-form">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) =>
              setSearchQuery((e.target as HTMLInputElement).value)
            }
            placeholder="Type a skill and press Enter or Add button"
            className="search-input"
          />
          <button
            type="submit"
            className="add-btn"
            disabled={!searchQuery.trim()}
          >
            Add
          </button>
        </form>
        <p className="helper-text">💡 For the best results, add 3-5 skills</p>
      </div>

      {selectedSkills.length > 0 && (
        <div className="selected-skills">
          <h3>Selected skills</h3>
          <div className="skills-list">
            {selectedSkills.map((skill) => (
              <div key={skill} className="skill-tag selected">
                {skill}
                <button
                  className="remove-skill"
                  onClick={() => handleRemoveSkill(skill)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {showNoResults && (
        <div className="no-results">
          <p>No matching skills found for "{searchQuery}"</p>
          <button
            className="add-custom-btn"
            onClick={() => handleAddSkill(searchQuery)}
          >
            Add "{searchQuery}" as a custom skill
          </button>
        </div>
      )}

      {!showNoResults && searchQuery === "" && (
        <div className="popular-skills">
          {Object.entries(popularSkills).map(([category, skills]) => (
            <div key={category} className="skills-category">
              <h3>Popular skills for {category}</h3>
              <div className="skills-grid">
                {skills
                  .filter((skill) => !selectedSkills.includes(skill))
                  .map((skill) => (
                    <button
                      key={skill}
                      className="skill-tag"
                      onClick={() => handleAddSkill(skill)}
                    >
                      {skill} +
                    </button>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="wizard-actions">
        <button className="back-btn" onClick={onBack}>
          Back
        </button>
        <button
          className="next-btn"
          onClick={onNext}
          disabled={selectedSkills.length === 0}
        >
          Next: Scope
        </button>
      </div>

      <style>{`
        .job-post-skills {
          max-width: 800px;
        }
        
        .job-post-skills h1 {
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
        
        .search-section {
          margin-bottom: 32px;
        }
        
        .search-section h3 {
          font-size: 16px;
          font-weight: 500;
          margin-bottom: 12px;
          color: #001e00;
        }
        
        .search-form {
          display: flex;
          gap: 8px;
          margin-bottom: 8px;
        }
        
        .search-input {
          flex: 1;
          padding: 12px 16px;
          font-size: 16px;
          border: 1px solid #d0d0d0;
          border-radius: 8px;
          transition: border-color 0.2s;
        }
        
        .search-input:focus {
          outline: none;
          border-color: #14a800;
        }
        
        .add-btn {
          padding: 12px 24px;
          background: #f2f2f2;
          color: #001e00;
          border: 1px solid #d0d0d0;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .add-btn:hover:not(:disabled) {
          background: #e8e8e8;
        }
        
        .add-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        
        .helper-text {
          font-size: 14px;
          color: #5e6d55;
          margin: 0;
        }
        
        .selected-skills {
          margin-bottom: 32px;
        }
        
        .selected-skills h3 {
          font-size: 16px;
          font-weight: 500;
          margin-bottom: 12px;
          color: #001e00;
        }
        
        .skills-list {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        
        .skill-tag {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 8px 16px;
          background: #f2f2f2;
          color: #001e00;
          border: 1px solid #d0d0d0;
          border-radius: 20px;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .skill-tag:hover {
          background: #e8e8e8;
        }
        
        .skill-tag.selected {
          background: #e7f5e7;
          border-color: #14a800;
          color: #14a800;
        }
        
        .remove-skill {
          background: none;
          border: none;
          font-size: 20px;
          line-height: 1;
          cursor: pointer;
          color: #14a800;
          padding: 0;
          margin-left: 4px;
        }
        
        .no-results {
          text-align: center;
          padding: 40px;
          background: #f7f7f7;
          border-radius: 8px;
          margin-bottom: 32px;
        }
        
        .no-results p {
          color: #5e6d55;
          margin-bottom: 16px;
        }
        
        .add-custom-btn {
          background: #14a800;
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
        }
        
        .popular-skills {
          margin-bottom: 32px;
        }
        
        .skills-category {
          margin-bottom: 24px;
        }
        
        .skills-category h3 {
          font-size: 16px;
          font-weight: 500;
          margin-bottom: 12px;
          color: #001e00;
        }
        
        .skills-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
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
