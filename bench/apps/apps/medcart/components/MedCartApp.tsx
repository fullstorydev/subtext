import { useState, useEffect } from "preact/hooks";
import { AppState, Page } from "../types";
import { Sidebar } from "./Sidebar";
import { Dashboard } from "./Dashboard";
import { Profile } from "./Profile";
import { Addresses } from "./Addresses";
import { Orders } from "./Orders";
import { Payments } from "./Payments";
import { Records } from "./Records";
import { Chat } from "./Chat";
import { UrlState } from "../../../shared/utils/url-state";

interface Props {
  initialState: Partial<AppState>;
}

export function MedCartApp({ initialState }: Props) {
  const [state, setState] = useState<AppState>({
    patient: initialState.patient || {
      id: "",
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      dateOfBirth: "",
      ssn: "",
      insuranceId: "",
      insuranceProvider: "",
    },
    addresses: initialState.addresses || [],
    orders: initialState.orders || [],
    paymentMethods: initialState.paymentMethods || [],
    medicalRecords: initialState.medicalRecords || [],
    chatThreads: initialState.chatThreads || [],
    page: { type: "dashboard" },
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
    if (path.includes("/profile")) return { type: "profile" };
    if (path.includes("/orders")) return { type: "orders" };
    if (path.includes("/addresses")) return { type: "addresses" };
    if (path.includes("/payments")) return { type: "payments" };
    if (path.includes("/records")) return { type: "records" };
    if (path.includes("/chat")) {
      const threadId = UrlState.getParam("thread");
      return { type: "chat", threadId: threadId || undefined };
    }
    return { type: "dashboard" };
  };

  const navigate = (page: Page) => {
    let url = "/";
    const params: Record<string, string> = {};

    switch (page.type) {
      case "profile":
        url = "/profile/";
        break;
      case "orders":
        url = "/orders/";
        break;
      case "addresses":
        url = "/addresses/";
        break;
      case "payments":
        url = "/payments/";
        break;
      case "records":
        url = "/records/";
        break;
      case "chat":
        url = "/chat/";
        if (page.threadId) params.thread = page.threadId;
        break;
    }

    const urlWithParams =
      Object.keys(params).length > 0
        ? `${url}?${new URLSearchParams(params).toString()}`
        : url;

    UrlState.pushState({}, "", urlWithParams);
    setState((prev) => ({ ...prev, page }));
  };

  return (
    <div className="medcart-app">
      <Sidebar
        currentPage={state.page.type}
        patientName={`${state.patient.firstName} ${state.patient.lastName}`}
        onNavigate={navigate}
      />
      <main className="medcart-main">
        {state.page.type === "dashboard" && (
          <Dashboard state={state} onNavigate={navigate} />
        )}
        {state.page.type === "profile" && <Profile patient={state.patient} />}
        {state.page.type === "orders" && <Orders orders={state.orders} />}
        {state.page.type === "addresses" && (
          <Addresses addresses={state.addresses} />
        )}
        {state.page.type === "payments" && (
          <Payments paymentMethods={state.paymentMethods} />
        )}
        {state.page.type === "records" && (
          <Records records={state.medicalRecords} />
        )}
        {state.page.type === "chat" && (
          <Chat
            threads={state.chatThreads}
            selectedThreadId={
              state.page.type === "chat" ? state.page.threadId : undefined
            }
            onNavigate={navigate}
          />
        )}
      </main>

      <style>{`
        .medcart-app {
          display: flex;
          min-height: 100vh;
          background: #f5f6fa;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
          color: #333;
          margin: 0;
        }
        .medcart-main {
          flex: 1;
          padding: 32px;
          overflow-y: auto;
        }
        * { box-sizing: border-box; }
        body { margin: 0; padding: 0; }
      `}</style>
    </div>
  );
}
