export function EmptyState({ title, body, action, className = '' }) {
  return (
    <div className={`border border-line px-5 py-10 text-center ${className}`}>
      <p className="text-sm text-ink-muted">{title}</p>
      {body ? <p className="mt-1 text-[13px] text-ink-subtle">{body}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}
