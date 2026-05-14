import { ChevronDown } from 'lucide-react'

interface SortConfig {
  key: string
  direction: 'asc' | 'desc'
}

interface SortButtonProps {
  columnKey: string
  label: string
  sort: SortConfig
  onSortChange: (key: string) => void
  className?: string
}

export default function SortButton({ columnKey, label, sort, onSortChange, className = '' }: SortButtonProps) {
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
