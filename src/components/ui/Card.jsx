export function Card({ as: Component = 'div', className = '', children, ...props }) {
  return (
    <Component
      className={`rounded-lg border border-line bg-surface ${className}`}
      {...props}
    >
      {children}
    </Component>
  )
}
