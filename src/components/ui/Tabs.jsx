export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="-mx-1 overflow-x-auto">
      <div
        role="tablist"
        className="flex min-w-max gap-1 border-b border-line"
      >
        {tabs.map((tab) => {
          const selected = tab.id === value
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onChange(tab.id)}
              className={`relative px-3 py-3 text-sm tracking-[-0.01em] transition-colors ${
                selected ? 'text-ink' : 'text-ink-subtle hover:text-ink-muted'
              }`}
            >
              {tab.label}
              {selected ? (
                <span className="absolute inset-x-3 -bottom-px h-px bg-accent" />
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}
