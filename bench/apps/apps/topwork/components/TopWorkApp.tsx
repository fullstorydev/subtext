import { useState, useEffect } from "preact/hooks";
import { AppState, Page, JobPost } from "../types";
import { Dashboard } from "./Dashboard";
import { FreelancerProfile } from "./FreelancerProfile";
import { SendOffer } from "./SendOffer";
import { Messages } from "./Messages";
import { OfferSent } from "./OfferSent";
import { Header } from "./Header";
import { Footer } from "./Footer";
import { JobPostWizard } from "./JobPostWizard";
import { UrlState } from "../../../shared/utils/url-state";

interface Props {
  initialState: Partial<AppState>;
}

export function TopworkApp({ initialState }: Props) {
  const [state, setState] = useState<AppState>({
    currentUser: initialState.currentUser || {
      id: "client1",
      name: "Tech Startup Inc",
      avatar: "",
      role: "client",
      company: "Tech Startup Inc",
    },
    freelancers: initialState.freelancers || [],
    jobs: initialState.jobs || [],
    contracts: initialState.contracts || [],
    messages: initialState.messages || [],
    page: { type: "dashboard" },
    currentJobPost: undefined,
  });

  useEffect(() => {
    const handlePopState = () => {
      const path = UrlState.getCurrentAppPath();
      const page = parseUrlToPage(path);
      setState((prev) => ({ ...prev, page }));
    };

    window.addEventListener("popstate", handlePopState);
    handlePopState();

    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const parseUrlToPage = (path: string): Page => {
    if (path.includes("/freelancer/")) {
      const id = UrlState.getParam("id");
      return id ? { type: "freelancer", id } : { type: "dashboard" };
    } else if (path.includes("/platform/offer/")) {
      const id = UrlState.getParam("id");
      return id ? { type: "offer", freelancerId: id } : { type: "dashboard" };
    } else if (path.includes("/messages/")) {
      const id = UrlState.getParam("id");
      return { type: "messages", freelancerId: id || undefined };
    } else if (path.includes("/offer/sent/")) {
      const id = UrlState.getParam("id");
      return id
        ? { type: "offer-sent", contractId: id }
        : { type: "dashboard" };
    } else if (path.includes("/job-post/")) {
      const step = UrlState.getParam("step");
      return { type: "job-post", step: step || undefined };
    }
    return { type: "dashboard" };
  };

  const navigate = (page: Page) => {
    let url = "/";
    const params: Record<string, string> = {};

    switch (page.type) {
      case "freelancer":
        url = "/freelancer/";
        params.id = page.id;
        break;
      case "offer":
        url = "/platform/offer/";
        params.id = page.freelancerId;
        break;
      case "messages":
        url = "/messages/";
        if (page.freelancerId) params.id = page.freelancerId;
        break;
      case "offer-sent":
        url = "/offer/sent/";
        params.id = page.contractId;
        break;
      case "job-post":
        url = "/job-post/new";
        if (page.step) params.step = page.step;
        // Initialize new job post if needed
        if (!state.currentJobPost) {
          setState((prev) => ({
            ...prev,
            currentJobPost: {
              title: "",
              skills: [],
              projectSize: "medium",
              projectDuration: "1_to_3_months",
              experienceLevel: "intermediate",
              hireOpportunity: false,
              budgetType: "hourly",
              description: "",
              currentStep: "title",
            },
          }));
        }
        break;
    }

    const urlWithParams =
      Object.keys(params).length > 0
        ? `${url}?${new URLSearchParams(params).toString()}`
        : url;

    UrlState.pushState({}, "", urlWithParams);
    setState((prev) => ({ ...prev, page }));
  };

  const updateState = (updates: Partial<AppState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  };

  return (
    <div className="topwork-app">
      <Header user={state.currentUser} onNavigate={navigate} />

      <main className="main-content">
        {state.page.type === "dashboard" && (
          <Dashboard
            freelancers={state.freelancers}
            jobs={state.jobs}
            onSelectFreelancer={(id) => navigate({ type: "freelancer", id })}
            onPostJob={() => navigate({ type: "job-post" })}
          />
        )}

        {state.page.type === "freelancer" && (
          <FreelancerProfile
            freelancer={state.freelancers.find(
              (f) => f.id === (state.page as any).id,
            )}
            onHire={(id) => navigate({ type: "offer", freelancerId: id })}
            onMessage={(id) => navigate({ type: "messages", freelancerId: id })}
          />
        )}

        {state.page.type === "offer" && (
          <SendOffer
            freelancer={state.freelancers.find(
              (f) => f.id === (state.page as any).freelancerId,
            )}
            jobs={state.jobs}
            onSendOffer={(contract: any) => {
              const contractWithId = {
                ...contract,
                id: Math.random().toString(36).substring(2, 15),
              };
              updateState({
                contracts: [...state.contracts, contractWithId],
                messages: [
                  ...state.messages,
                  {
                    id: Math.random().toString(36).substring(2, 15),
                    senderId: state.currentUser.id,
                    recipientId: contract.freelancerId,
                    content: `Contract offer sent for ${contract.title}`,
                    timestamp: new Date().toISOString(),
                    contractId: contractWithId.id,
                  },
                ],
              });
              navigate({
                type: "messages",
                freelancerId: contract.freelancerId,
              });
            }}
            onCancel={() => window.history.back()}
          />
        )}

        {state.page.type === "messages" && (
          <Messages
            messages={state.messages}
            contracts={state.contracts}
            freelancers={state.freelancers}
            currentUser={state.currentUser}
            selectedFreelancerId={(state.page as any).freelancerId}
            onViewContract={(contractId: string) =>
              navigate({ type: "offer-sent", contractId })
            }
          />
        )}

        {state.page.type === "offer-sent" && (
          <OfferSent
            contract={state.contracts.find(
              (c) => c.id === (state.page as any).contractId,
            )}
            freelancer={state.freelancers.find(
              (f) =>
                state.contracts.find(
                  (c) => c.id === (state.page as any).contractId,
                )?.freelancerId === f.id,
            )}
            onMessage={(freelancerId: string) =>
              navigate({ type: "messages", freelancerId })
            }
          />
        )}

        {state.page.type === "job-post" && state.currentJobPost && (
          <JobPostWizard
            jobPost={state.currentJobPost}
            onUpdateJobPost={(updates) => {
              setState((prev) => ({
                ...prev,
                currentJobPost: prev.currentJobPost
                  ? { ...prev.currentJobPost, ...updates }
                  : undefined,
              }));
            }}
            onBack={() => navigate({ type: "dashboard" })}
            onSubmit={() => {
              if (state.currentJobPost) {
                const newJob = {
                  id: Math.random().toString(36).substring(2, 15),
                  title: state.currentJobPost.title,
                  description: state.currentJobPost.description,
                  client: state.currentUser.name,
                  posted: "Just now",
                  budget:
                    state.currentJobPost.budgetType === "hourly"
                      ? `$${state.currentJobPost.hourlyRateFrom}-$${state.currentJobPost.hourlyRateTo}/hr`
                      : `$${state.currentJobPost.fixedPrice}`,
                  duration: state.currentJobPost.projectDuration.replace(
                    /_/g,
                    " ",
                  ),
                  experienceLevel: state.currentJobPost.experienceLevel,
                  category: "Software Development",
                  skills: state.currentJobPost.skills,
                  proposals: 0,
                  status: "open" as const,
                };
                setState((prev) => ({
                  ...prev,
                  jobs: [...prev.jobs, newJob],
                  currentJobPost: undefined,
                }));
                navigate({ type: "dashboard" });
              }
            }}
          />
        )}
      </main>

      <Footer />

      <style>{`
        .topwork-app {
          min-height: 100vh;
          background-color: #f7f7f7;
        }
        
        .main-content {
          max-width: 1440px;
          margin: 0 auto;
        }
        
        * {
          box-sizing: border-box;
        }
        
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
          color: #001e00;
          margin: 0;
          padding: 0;
          line-height: 1.5;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }
        
        h1, h2, h3, h4, h5, h6 {
          line-height: 1.2;
        }
        
        a {
          color: inherit;
          text-decoration: none;
        }
        
        button {
          font-family: inherit;
        }
        
        input, textarea, select {
          font-family: inherit;
        }
      `}</style>
    </div>
  );
}
