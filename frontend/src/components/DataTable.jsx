export default function DataTable({
  columns,
  data,
  search,
  onSearchChange,
  page,
  totalPages,
  onPageChange,
  emptyMessage = 'No data found',
}) {
  return (
    <div className="card overflow-hidden p-0">
      {onSearchChange && (
        <div className="border-b border-slate-800 p-4">
          <input
            type="search"
            placeholder="Search..."
            value={search || ''}
            onChange={(e) => onSearchChange(e.target.value)}
            className="input max-w-xs"
          />
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-slate-800 bg-slate-900">
            <tr>
              {columns.map((col) => (
                <th key={col.key} className="table-th">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {data?.length ? (
              data.map((row, i) => (
                <tr key={row.id || i} className="hover:bg-slate-800/80">
                  {columns.map((col) => (
                    <td key={col.key} className="table-td">
                      {col.render ? col.render(row) : row[col.key]}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center text-slate-400">
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-slate-800 px-4 py-3">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            className="btn-secondary disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-sm text-slate-400">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            className="btn-secondary disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
