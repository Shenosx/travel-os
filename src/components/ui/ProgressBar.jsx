export function ProgressBar({ value, className = '' }) {
  const width = Math.max(0, Math.min(100, value))

  return (
    <div className={`h-[3px] w-full overflow-hidden bg-surface-muted ${className}`}>
      <div
        className="h-full bg-accent transition-[width] duration-300"
        style={{ width: `${width}%` }}
      />
    </div>
  )
}
