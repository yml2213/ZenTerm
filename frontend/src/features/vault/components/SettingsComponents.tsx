import {
  forwardRef,
  useId,
  type CSSProperties,
  type ChangeEvent,
  type ComponentType,
  type ReactNode,
} from 'react'

export interface SettingsGroupProps {
  title?: string
  description?: string
  footer?: ReactNode
  className?: string
  children: ReactNode
}

export function SettingsGroup({
  title,
  description,
  footer,
  className = '',
  children,
}: SettingsGroupProps) {
  return (
    <div className={`settings-group-card ${className}`.trim()}>
      {(title || description) && (
        <div className="settings-group-header">
          {title && <h3 className="settings-group-title">{title}</h3>}
          {description && <p className="settings-group-desc">{description}</p>}
        </div>
      )}
      <div className="settings-group-content">{children}</div>
      {footer && <div className="settings-group-footer">{footer}</div>}
    </div>
  )
}

export interface SettingsRowProps {
  icon?: ComponentType<{ size?: number; className?: string }>
  iconColor?: string
  title: ReactNode
  description?: ReactNode
  children?: ReactNode
  action?: ReactNode
  alignTop?: boolean
  danger?: boolean
  onClick?: () => void
  className?: string
  badge?: ReactNode
}

export function SettingsRow({
  icon: Icon,
  iconColor,
  title,
  description,
  children,
  action,
  alignTop = false,
  danger = false,
  onClick,
  className = '',
  badge,
}: SettingsRowProps) {
  return (
    <div
      className={[
        'settings-row',
        alignTop ? 'align-top' : '',
        danger ? 'is-danger' : '',
        onClick ? 'is-clickable' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={onClick}
    >
      {Icon && (
        <div
          className="settings-row-icon"
          style={iconColor ? { color: iconColor } : undefined}
          aria-hidden="true"
        >
          <Icon size={17} />
        </div>
      )}
      <div className="settings-row-text">
        <div className="settings-row-title-row">
          <span className="settings-row-title">{title}</span>
          {badge && <span className="settings-row-badge">{badge}</span>}
        </div>
        {description && <span className="settings-row-description">{description}</span>}
      </div>
      {(children || action) && (
        <div className="settings-row-control" onClick={(e) => e.stopPropagation()}>
          {children}
          {action}
        </div>
      )}
    </div>
  )
}

export interface SettingsSwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  label?: string
  id?: string
  name?: string
  className?: string
}

export const SettingsSwitch = forwardRef<HTMLInputElement, SettingsSwitchProps>(
  function SettingsSwitch(
    {
      checked,
      onChange,
      disabled = false,
      label,
      id,
      name,
      className = '',
    },
    ref,
  ) {
    const defaultId = useId()
    const switchId = id || defaultId

    function handleChange(e: ChangeEvent<HTMLInputElement>) {
      onChange(e.target.checked)
    }

    return (
      <label
        className={`settings-switch-wrapper${disabled ? ' is-disabled' : ''}${
          className ? ` ${className}` : ''
        }`}
      >
        <input
          ref={ref}
          id={switchId}
          type="checkbox"
          role="switch"
          name={name}
          aria-label={label}
          aria-checked={checked}
          checked={checked}
          disabled={disabled}
          onChange={handleChange}
          className="settings-switch-native"
        />
        <span
          className={`settings-switch-track${checked ? ' is-checked' : ''}`}
          aria-hidden="true"
        >
          <span className="settings-switch-thumb" />
        </span>
      </label>
    )
  },
)

export interface SettingsSegmentedOption<T extends string> {
  value: T
  label: string
  icon?: ComponentType<{ size?: number; className?: string }>
}

export interface SettingsSegmentedProps<T extends string> {
  options: SettingsSegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  size?: 'sm' | 'md'
  disabled?: boolean
  className?: string
}

export function SettingsSegmented<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  disabled = false,
  className = '',
}: SettingsSegmentedProps<T>) {
  return (
    <div
      role="radiogroup"
      className={`settings-segmented settings-segmented-${size}${
        disabled ? ' is-disabled' : ''
      }${className ? ` ${className}` : ''}`}
    >
      {options.map((opt) => {
        const active = opt.value === value
        const Icon = opt.icon
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            className={`settings-segmented-btn${active ? ' is-active' : ''}`}
            onClick={() => onChange(opt.value)}
          >
            {Icon && <Icon size={14} />}
            <span>{opt.label}</span>
          </button>
        )
      })}
    </div>
  )
}

export interface SettingsSliderProps {
  value: number
  min: number
  max: number
  step?: number
  unit?: string
  onChange: (value: number) => void
  disabled?: boolean
  ariaLabel?: string
  formatValue?: (val: number) => string
}

export function SettingsSlider({
  value,
  min,
  max,
  step = 1,
  unit = '',
  onChange,
  disabled = false,
  ariaLabel,
  formatValue,
}: SettingsSliderProps) {
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100))
  const fillStyle = { '--fill-pct': `${pct}%` } as CSSProperties

  return (
    <div className="settings-slider-wrapper">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={ariaLabel}
        style={fillStyle}
        className="settings-slider-range"
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <output className="settings-slider-badge">
        {formatValue ? formatValue(value) : `${value}${unit}`}
      </output>
    </div>
  )
}
