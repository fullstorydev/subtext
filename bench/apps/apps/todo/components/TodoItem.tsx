import { TodoItem } from "../types";

interface TodoItemProps {
  item: TodoItem;
  onToggle: () => void;
  onDelete: () => void;
}

export function TodoItemComponent({ item, onToggle, onDelete }: TodoItemProps) {
  return (
    <div className={`todo-item ${item.done ? "done" : ""}`}>
      <style>{`
        .todo-item {
          display: flex;
          align-items: center;
          padding: var(--spacing-md);
          background: var(--surface);
          border-bottom: 1px solid var(--border);
          transition: background-color var(--transition);
        }
        
        .todo-item:hover {
          background: var(--surface-secondary);
        }
        
        .todo-item.done .todo-text {
          text-decoration: line-through;
          color: var(--text-tertiary);
        }
        
        .todo-checkbox {
          width: 1.25rem;
          height: 1.25rem;
          margin-right: var(--spacing-md);
          cursor: pointer;
        }
        
        .todo-text {
          flex: 1;
          font-size: 1rem;
          color: var(--text-primary);
          transition: all var(--transition);
        }
        
        .todo-delete {
          padding: var(--spacing-xs) var(--spacing-sm);
          background: none;
          border: 1px solid transparent;
          border-radius: var(--radius-sm);
          color: var(--text-tertiary);
          font-size: 0.875rem;
          cursor: pointer;
          transition: all var(--transition);
          opacity: 0;
        }
        
        .todo-item:hover .todo-delete {
          opacity: 1;
        }
        
        .todo-delete:hover {
          background: var(--danger);
          color: white;
          border-color: var(--danger);
        }
      `}</style>

      <input
        type="checkbox"
        className="todo-checkbox"
        checked={item.done}
        onChange={onToggle}
      />
      <span className="todo-text">{item.text}</span>
      <button className="todo-delete" onClick={onDelete}>
        Delete
      </button>
    </div>
  );
}
