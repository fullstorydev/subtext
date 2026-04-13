import { useEffect, useState } from "preact/hooks";
import { computed } from "@preact/signals";
import { StateManager } from "../../../shared/utils/state-manager";
import { TodoItem, TodoFilter } from "../types";
import { scenarios } from "../scenarios";
import {
  ScenarioManager,
  ScenarioConfig,
} from "../../../shared/utils/scenario-manager";
import { usePersistedState } from "../hooks/usePersistedState";
import { TodoItemComponent } from "./TodoItem";
import { List } from "./List";

// Initialize state manager and register stores
const stateManager = new StateManager("preact-todo");
stateManager.registerStore("todos", []);
stateManager.registerStore("preferences", { filter: "all" });

// Initialize scenarios and load from URL if present
const scenarioConfig: ScenarioConfig<any> = {
  scenarios,
  transformData: (scenario) => {
    // Convert scenario items to Map entries with generated IDs
    const todoEntries = scenario.items.map((item: any) => {
      const id = Date.now().toString() + Math.random().toString(36);
      const todo: TodoItem = {
        ...item,
        id,
        createdAt: item.createdAt || new Date(),
      };
      return [id, todo];
    });

    return {
      todos: todoEntries,
      preferences: { filter: "all" },
    };
  },
};

ScenarioManager.loadFromUrl(scenarioConfig, (scenarioData) => {
  stateManager.initializeFromScenario(scenarioData);
});

// Mark initialization complete
stateManager.finishInitialization();

export function TodoApp() {
  // Persisted state using signals
  const { state: todosState, unsubscribe: unsubTodos } = usePersistedState<
    Array<[string, TodoItem]>
  >(stateManager, "todos", []);

  const { state: prefsState, unsubscribe: unsubPrefs } = usePersistedState<{
    filter: TodoFilter["type"];
  }>(stateManager, "preferences", { filter: "all" });

  // Local state for input
  const [inputText, setInputText] = useState("");

  // Convert array to Map for easier manipulation
  const todosMap = computed(() => new Map(todosState.value));

  // Computed values
  const visibleTodos = computed(() => {
    const todos = Array.from(todosMap.value.values());
    switch (prefsState.value.filter) {
      case "active":
        return todos.filter((t) => !t.done);
      case "completed":
        return todos.filter((t) => t.done);
      default:
        return todos;
    }
  });

  const activeCount = computed(
    () => Array.from(todosMap.value.values()).filter((t) => !t.done).length,
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      unsubTodos();
      unsubPrefs();
      // Don't destroy the stateManager - it's a module-level singleton
    };
  }, []);

  // Event handlers
  const addTodo = () => {
    const text = inputText.trim();
    if (!text) return;

    const todo: TodoItem = {
      id: Date.now().toString(),
      text,
      done: false,
      createdAt: new Date(),
    };

    const newTodos = new Map(todosMap.value);
    newTodos.set(todo.id, todo);
    todosState.value = Array.from(newTodos.entries());
    setInputText("");
  };

  const toggleTodo = (id: string) => {
    const newTodos = new Map(todosMap.value);
    const todo = newTodos.get(id);
    if (todo) {
      // Create a new todo object instead of mutating the existing one
      newTodos.set(id, { ...todo, done: !todo.done });
      todosState.value = Array.from(newTodos.entries());
    }
  };

  const deleteTodo = (id: string) => {
    const newTodos = new Map(todosMap.value);
    newTodos.delete(id);
    todosState.value = Array.from(newTodos.entries());
  };

  const clearCompleted = () => {
    const newTodos = new Map(todosMap.value);
    Array.from(newTodos.entries()).forEach(([id, todo]) => {
      if (todo.done) {
        newTodos.delete(id);
      }
    });
    todosState.value = Array.from(newTodos.entries());
  };

  const setFilter = (filter: TodoFilter["type"]) => {
    prefsState.value = { filter };
  };

  const getEmptyMessage = () => {
    if (prefsState.value.filter === "all") {
      return "No todos yet. Add one above!";
    }
    return `No ${prefsState.value.filter} todos.`;
  };

  return (
    <div className="todo-app">
      <style>{`
        .todo-app {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          display: flex;
          flex-direction: column;
          background: var(--surface);
          --width: 600px;
        }
        
        .header {
          position: fixed;
          top: 0;
          left: 50%;
          transform: translateX(-50%);
          width: 100%;
          max-width: var(--width);
          padding: var(--spacing-lg);
          background: var(--surface);
          border-bottom: 1px solid var(--border);
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          z-index: 10;
        }
        
        .header h1 {
          font-size: 1.875rem;
          font-weight: 700;
          margin-bottom: var(--spacing-md);
        }
        
        .input-group {
          display: flex;
          gap: var(--spacing-sm);
        }
        
        .new-todo {
          flex: 1;
          padding: var(--spacing-sm) var(--spacing-md);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          font-size: 1rem;
          transition: border-color var(--transition);
        }
        
        .new-todo:focus {
          outline: none;
          border-color: var(--border-focus);
        }
        
        .add-btn {
          padding: var(--spacing-sm) var(--spacing-lg);
          background: var(--primary);
          color: white;
          border: none;
          border-radius: var(--radius-md);
          font-size: 1rem;
          font-weight: 500;
          cursor: pointer;
          transition: background-color var(--transition);
        }
        
        .add-btn:hover:not(:disabled) {
          background: var(--primary-hover);
        }
        
        .add-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        
        .todo-items {
          flex: 1;
          overflow-y: auto;
          padding-top: 160px;
          padding-bottom: 60px;
          max-width: var(--width);
          margin: 0 auto;
          width: 100%;
        }
        
        .footer {
          position: fixed;
          bottom: 0;
          left: 50%;
          transform: translateX(-50%);
          width: 100%;
          max-width: var(--width);
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--spacing-md) var(--spacing-lg);
          background: var(--surface-secondary);
          border-top: 1px solid var(--border);
          box-shadow: 0 -1px 3px rgba(0, 0, 0, 0.1);
          font-size: 0.875rem;
          color: var(--text-secondary);
          z-index: 10;
        }
        
        .filters {
          display: flex;
          gap: var(--spacing-sm);
        }
        
        .filter-btn {
          padding: var(--spacing-xs) var(--spacing-sm);
          background: none;
          border: 1px solid transparent;
          border-radius: var(--radius-sm);
          font-size: 0.875rem;
          cursor: pointer;
          transition: all var(--transition);
        }
        
        .filter-btn:hover {
          border-color: var(--border);
        }
        
        .filter-btn.active {
          border-color: var(--primary);
          color: var(--primary);
        }
        
        .clear-completed {
          background: none;
          border: none;
          color: var(--text-secondary);
          font-size: 0.875rem;
          cursor: pointer;
          transition: color var(--transition);
        }
        
        .clear-completed:hover {
          color: var(--danger);
        }
      `}</style>

      <div className="header">
        <h1>Todo List</h1>
        <form
          className="input-group"
          onSubmit={(e) => {
            e.preventDefault();
            addTodo();
          }}
        >
          <input
            type="text"
            className="new-todo"
            placeholder="What needs to be done?"
            value={inputText}
            onInput={(e) => setInputText((e.target as HTMLInputElement).value)}
          />
          <button type="submit" className="add-btn">
            Add
          </button>
        </form>
      </div>

      <div className="todo-items">
        <List
          items={visibleTodos.value}
          renderItem={(todo) => (
            <TodoItemComponent
              item={todo}
              onToggle={() => toggleTodo(todo.id)}
              onDelete={() => deleteTodo(todo.id)}
            />
          )}
          getKey={(todo) => todo.id}
          emptyMessage={getEmptyMessage()}
        />
      </div>

      <div className="footer">
        <span className="count">
          {activeCount.value} {activeCount.value === 1 ? "item" : "items"} left
        </span>
        <div className="filters">
          {(["all", "active", "completed"] as const).map((filterType) => (
            <button
              key={filterType}
              className={`filter-btn ${prefsState.value.filter === filterType ? "active" : ""}`}
              onClick={() => setFilter(filterType)}
            >
              {filterType.charAt(0).toUpperCase() + filterType.slice(1)}
            </button>
          ))}
        </div>
        <button className="clear-completed" onClick={clearCompleted}>
          Clear completed
        </button>
      </div>
    </div>
  );
}
