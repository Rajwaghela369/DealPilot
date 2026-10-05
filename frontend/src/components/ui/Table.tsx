import type { ReactNode } from 'react'

export interface Column<T> {
  /** Stable key; also the React key for the cell. */
  key: string
  header: ReactNode
  /** Right-aligns and tabular-numbers the column. */
  numeric?: boolean
  render: (row: T) => ReactNode
}

export interface TableProps<T> {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  /** Makes rows clickable, and keyboard-navigable with Enter. */
  onRowClick?: (row: T) => void
  /** Rendered in place of the whole table when `rows` is empty. */
  empty?: ReactNode
}

export function Table<T>({ columns, rows, rowKey, onRowClick, empty }: TableProps<T>) {
  if (rows.length === 0 && empty) {
    return <>{empty}</>
  }

  return (
    <div className="ui-table-scroll">
      <table className="ui-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} className={col.numeric ? 'th--numeric' : undefined} scope="col">
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              className={onRowClick ? 'is-clickable' : undefined}
              // A `<tr>` cannot hold the `<a>` that would make it navigable,
              // so the row carries the keyboard affordance itself rather
              // than being mouse-only.
              tabIndex={onRowClick ? 0 : undefined}
              role={onRowClick ? 'link' : undefined}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onKeyDown={
                onRowClick
                  ? (event) => {
                      if (event.key === 'Enter') onRowClick(row)
                    }
                  : undefined
              }
            >
              {columns.map((col) => (
                <td key={col.key} className={col.numeric ? 'td--numeric' : undefined}>
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Wraps a cell's controls so a click on them does not also trigger the row.
 *
 * Without this, "Delete" inside a clickable row both opens the detail page
 * and asks to delete.
 */
export function RowActions({ children }: { children: ReactNode }) {
  return (
    <div
      className="ui-table__actions"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {children}
    </div>
  )
}
