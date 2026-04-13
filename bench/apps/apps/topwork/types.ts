export interface Freelancer {
  id: string;
  name: string;
  title: string;
  avatar: string;
  location: string;
  hourlyRate: number;
  earnings: string;
  jobsCompleted: number;
  hoursWorked: number;
  rating: number;
  available: boolean;
  skills: string[];
  description: string;
  employmentHistory: Employment[];
  education: Education[];
}

export interface Employment {
  id: string;
  title: string;
  company: string;
  startDate: string;
  endDate: string | null;
  description: string;
  rating?: number;
  feedback?: string;
}

export interface Education {
  id: string;
  degree: string;
  school: string;
  field: string;
  startYear: number;
  endYear: number;
}

export interface Job {
  id: string;
  title: string;
  description: string;
  client: string;
  posted: string;
  budget: string;
  duration: string;
  experienceLevel: string;
  category: string;
  skills: string[];
  proposals: number;
  status: "open" | "in_progress" | "completed";
}

export interface Contract {
  id: string;
  freelancerId: string;
  jobId: string;
  title: string;
  type: "hourly" | "fixed";
  hourlyRate?: number;
  weeklyLimit?: number;
  fixedPrice?: number;
  description: string;
  status: "pending" | "active" | "completed";
  startDate?: string;
  endDate?: string;
  hiringTeam?: string;
  automaticPayment?: number;
}

export interface Message {
  id: string;
  senderId: string;
  recipientId: string;
  content: string;
  timestamp: string;
  contractId?: string;
  attachments?: Attachment[];
}

export interface Attachment {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
}

export interface User {
  id: string;
  name: string;
  avatar: string;
  role: "client" | "freelancer";
  company?: string;
}

export interface JobPost {
  id?: string;
  title: string;
  skills: string[];
  projectSize: "large" | "medium" | "small";
  projectDuration: "more_than_6_months" | "3_to_6_months" | "1_to_3_months";
  experienceLevel: "entry" | "intermediate" | "expert";
  hireOpportunity: boolean;
  budgetType: "hourly" | "fixed";
  hourlyRateFrom?: number;
  hourlyRateTo?: number;
  fixedPrice?: number;
  description: string;
  currentStep: "title" | "skills" | "scope" | "budget" | "description";
}

export type Page =
  | { type: "dashboard" }
  | { type: "freelancer"; id: string }
  | { type: "offer"; freelancerId: string }
  | { type: "messages"; freelancerId?: string }
  | { type: "offer-sent"; contractId: string }
  | { type: "job-post"; step?: string };

export interface AppState {
  currentUser: User;
  freelancers: Freelancer[];
  jobs: Job[];
  contracts: Contract[];
  messages: Message[];
  page: Page;
  currentJobPost?: JobPost;
}
