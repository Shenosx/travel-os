export function ProgressBar({ value, now, max, label, className = '' }) {
  const valuemax = max == null ? 100 : max
  const valuenow = now == null ? Math.round(Math.max(0, Math.min(100, Number(value) || 0))) : now
  const width = valuemax <= 0 ? 0 : Math.max(0, Math.min(100, (valuenow / valuemax) * 100))

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={valuenow}
      aria-valuemin={0}
      aria-valuemax={valuemax}
      className={`h-[3px] w-full overflow-hidden bg-surface-muted ${className}`}
    >
      <div className="h-full bg-accent transition-[width] duration-300" style={{ width: `${width}%` }} />
    </div>
  )
}
