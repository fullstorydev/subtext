import { VNode } from "preact";

interface ListManagerProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => VNode;
  getKey: (item: T) => string | number;
  emptyMessage?: string;
  className?: string;
}

export function List<T>({
  items,
  renderItem,
  getKey,
  emptyMessage = "No items",
  className = "",
}: ListManagerProps<T>) {
  if (items.length === 0) {
    return (
      <div className={`empty-state ${className}`}>
        <style>{`
          .empty-state {
            padding: var(--spacing-xl);
            text-align: center;
            color: var(--text-tertiary);
          }
        `}</style>
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className={className}>
      {items.map((item, index) => (
        <div key={getKey(item)}>{renderItem(item, index)}</div>
      ))}
    </div>
  );
}
