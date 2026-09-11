export function StatGrid({ stats, currency = 'MYR', formatMoney }) {
  const items = [
    { label: 'Trips this year', value: String(stats.tripCount) },
    { label: 'Cities', value: String(stats.cityCount) },
    { label: 'Days on the road', value: String(stats.daysOnTheRoad) },
    { label: 'Spent this year', value: formatMoney(stats.spent, currency) },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-lg border border-line bg-surface px-4 py-5">
          <p className="text-[11px] tracking-[0.12em] text-ink-subtle uppercase">{item.label}</p>
          <p className="font-display mt-3 text-[28px] leading-none tracking-[-0.04em] text-ink">
            {item.value}
          </p>
        </div>
      ))}
    </div>
  )
}
