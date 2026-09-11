export function Avatar({ initials, size = 'md', emphasis = false, className = '' }) {
  const sizes = {
    sm: 'h-7 w-7 text-[10px]',
    md: 'h-9 w-9 text-xs',
    lg: 'h-11 w-11 text-sm',
  }

  return (
    <span
      className={`inline-flex items-center justify-center rounded-full font-medium tracking-wide ${
        emphasis
          ? 'bg-accent text-white'
          : 'bg-accent-soft text-accent'
      } ${sizes[size]} ${className}`}
    >
      {initials}
    </span>
  )
}
