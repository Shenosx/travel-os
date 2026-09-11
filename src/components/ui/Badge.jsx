export function Badge({ children, tone = 'neutral', className = '' }) {
  const tones = {
    neutral: 'text-ink-muted border-line bg-canvas',
    accent: 'text-accent border-transparent bg-accent-soft',
    muted: 'text-ink-subtle border-line bg-transparent',
  }

  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-[3px] text-[11px] font-medium tracking-[0.04em] uppercase ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  )
}
