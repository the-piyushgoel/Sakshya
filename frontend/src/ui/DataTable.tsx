import type { ReactNode } from 'react';

export interface DataColumn<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  emptyMessage = 'No records to show.',
}: {
  rows: T[];
  columns: DataColumn<T>[];
  rowKey: (row: T) => string;
  emptyMessage?: string;
}) {
  if (rows.length === 0) return <div className="py-8 text-center text-sm text-slate-500">{emptyMessage}</div>;
  return (
    <div className="-mx-5 overflow-x-auto sm:-mx-6">
      <table className="data-table">
        <thead><tr>{columns.map((column) => <th key={column.key} className={column.className}>{column.header}</th>)}</tr></thead>
        <tbody>{rows.map((row) => <tr key={rowKey(row)}>{columns.map((column) => <td key={column.key} className={column.className}>{column.render(row)}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}
