export interface TodoItem {
  id: string;
  text: string;
  done: boolean;
  createdAt: Date;
}

export interface TodoFilter {
  type: "all" | "active" | "completed";
}
