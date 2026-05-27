/**
 * ApiTable component for documentation
 *
 * Displays API endpoints, parameters, and other tabular data.
 */

interface Column {
  key: string;
  header: string;
  className?: string;
}

interface ApiTableProps {
  columns: Column[];
  data: Record<string, string | React.ReactNode>[];
  className?: string;
}

export function ApiTable({ columns, data, className = '' }: ApiTableProps) {
  return (
    <div className={`overflow-x-auto my-4 ${className}`}>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-muted">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`text-left p-3 font-semibold text-foreground border-b border-border ${col.className || ''}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, index) => (
            <tr
              key={index}
              className="border-b border-border hover:bg-muted/50 transition-colors"
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`p-3 text-muted-foreground ${col.className || ''}`}
                >
                  {row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
