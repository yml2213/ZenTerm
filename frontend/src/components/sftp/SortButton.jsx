import { ChevronDown } from 'lucide-react'

export default function SortButton({ columnKey, label, sort, onSortChange, className = '' }) {
  const isActive = sort.key === columnKey

  return (
    <button
      type="button"
      className={`sftp-head-sort${isActive ? ' active' : ''}${className ? ` ${className}` : ''}`}
      onClick={() => onSortChange(columnKey)}
    >
      <span>{label}</span>
      {isActive ? (
        <ChevronDown size={13} className={`sftp-sort-indicator${sort.direction === 'desc' ? ' desc' : ''}`} />
      ) : null}
    </button>
  )
}
