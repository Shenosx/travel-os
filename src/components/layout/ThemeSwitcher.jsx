import { useTheme } from '../../hooks/useTheme.jsx'
import { IconMoon, IconSun } from '../icons.jsx'

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme()

  return (
    <div
      role="group"
      aria-label="Theme"
      className="inline-flex rounded-md border border-line p-[3px]"
    >
      <button
        type="button"
        onClick={() => setTheme('light')}
        className={`inline-flex items-center gap-1.5 rounded-[5px] px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
          theme === 'light' ? 'bg-accent-soft text-accent' : 'text-ink-subtle hover:text-ink-muted'
        }`}
        aria-pressed={theme === 'light'}
      >
        <IconSun className="h-3.5 w-3.5" />
        Light
      </button>
      <button
        type="button"
        onClick={() => setTheme('dark')}
        className={`inline-flex items-center gap-1.5 rounded-[5px] px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
          theme === 'dark' ? 'bg-accent-soft text-accent' : 'text-ink-subtle hover:text-ink-muted'
        }`}
        aria-pressed={theme === 'dark'}
      >
        <IconMoon className="h-3.5 w-3.5" />
        Dark
      </button>
    </div>
  )
}
