export function SectionHeading({ kicker, action }) {
  return (
    <div className="mb-5 flex items-baseline justify-between gap-4">
      <h2 className="text-[11px] tracking-[0.18em] text-ink-subtle uppercase">{kicker}</h2>
      {action ? <div className="shrink-0 text-[13px]">{action}</div> : null}
    </div>
  )
}
