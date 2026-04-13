interface TodoScenario {
  id: string;
  name: string;
  description: string;
  items: Array<{
    text: string;
    done: boolean;
    createdAt?: Date;
  }>;
}

export const scenarios: TodoScenario[] = [
  {
    id: "empty",
    name: "Empty",
    description: "A clean todo list with no items",
    items: [],
  },
  {
    id: "basic",
    name: "Basic",
    description: "A few simple todos",
    items: [
      { text: "Buy groceries", done: false },
      { text: "Walk the dog", done: true },
      { text: "Read a book", done: false },
    ],
  },
  {
    id: "productivity",
    name: "Productivity",
    description: "Work and personal tasks mixed",
    items: [
      { text: "Finish project proposal", done: false },
      { text: "Review pull requests", done: true },
      { text: "Team standup meeting", done: true },
      { text: "Update documentation", done: false },
      { text: "Call dentist for appointment", done: false },
      { text: "Pick up dry cleaning", done: true },
      { text: "Plan weekend trip", done: false },
    ],
  },
  {
    id: "overdue",
    name: "Overdue",
    description: "Tasks with many overdue items",
    items: [
      {
        text: "File taxes",
        done: false,
        createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      },
      {
        text: "Renew car registration",
        done: false,
        createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
      },
      {
        text: "Annual health checkup",
        done: false,
        createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      },
      { text: "Water the plants", done: true },
      { text: "Submit expense report", done: false },
    ],
  },
  {
    id: "completed",
    name: "Mostly Completed",
    description: "Most tasks are done",
    items: [
      { text: "Morning workout", done: true },
      { text: "Prepare presentation", done: true },
      { text: "Client meeting", done: true },
      { text: "Code review", done: true },
      { text: "Update website", done: true },
      { text: "Write blog post", done: false },
      { text: "Team retrospective", done: true },
    ],
  },
];
