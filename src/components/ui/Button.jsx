const variants = {
  primary:
    'bg-accent text-white hover:bg-accent-hover border-transparent',
  ghost:
    'bg-transparent text-ink hover:bg-canvas-muted border-transparent',
  outline:
    'bg-transparent text-ink border-line hover:bg-canvas-muted',
}

const sizes = {
  sm: 'h-9 px-3 text-[13px]',
  md: 'h-10 px-4 text-sm',
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  type = 'button',
  ...props
}) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-md border font-medium tracking-[-0.01em] transition-colors disabled:opacity-40 ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
