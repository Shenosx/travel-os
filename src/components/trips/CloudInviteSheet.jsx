import { useState } from 'react'
import { copyText } from '../../lib/trips/invitations.js'
import { ROLE_LABEL } from '../../lib/people.js'
import { IconCopy } from '../icons.jsx'
import { Button } from '../ui/Button.jsx'
import { Field, fieldClass } from '../ui/Field.jsx'
import { Sheet } from '../ui/Sheet.jsx'

const ROLE_NOTE = {
  editor: 'Can add to the days and the spending.',
  viewer: 'Along for the plan — view only.',
}

export function CloudInviteSheet({ onClose, onInvite }) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState('editor')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(null)
  const [copied, setCopied] = useState(false)
  const [copyHint, setCopyHint] = useState('')

  async function send() {
    setBusy(true)
    setError('')
    const result = await onInvite({ email, role, invitedName: name })
    setBusy(false)
    if (result.error) {
      setError(result.error)
      setSent(null)
      return null
    }
    setSent(result)
    return result
  }

  async function copyLink() {
    const result = sent ?? (await send())
    if (!result?.link) return
    const copiedResult = await copyText(result.link)
    if (copiedResult.ok) {
      setCopied(true)
      setCopyHint('')
      window.setTimeout(() => setCopied(false), 1600)
      return
    }
    setCopied(false)
    setCopyHint(copiedResult.error || 'Copy the link from the field below.')
  }

  return (
    <Sheet kicker="Cloud" title="Invite someone" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-ink-muted">
          They’ll open the trip with this link. Nothing is emailed. The secret stays in the link,
          not on this device.
        </p>
        <Field label="Email">
          <input
            className={fieldClass}
            type="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value)
              setError('')
              setSent(null)
            }}
            placeholder="alex@email.com"
            autoFocus
          />
        </Field>
        <Field label="Name">
          <input
            className={fieldClass}
            value={name}
            onChange={(event) => {
              setName(event.target.value)
              setSent(null)
            }}
            placeholder="Optional"
          />
        </Field>
        <div>
          <p className="mb-2 text-[12px] tracking-[0.08em] text-ink-subtle uppercase">Role</p>
          <div className="grid grid-cols-2 gap-2">
            {['editor', 'viewer'].map((id) => {
              const selected = role === id
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setRole(id)
                    setSent(null)
                  }}
                  className={`rounded-md border px-3 py-3 text-left ${
                    selected ? 'border-transparent bg-accent-soft text-accent' : 'border-line text-ink-muted'
                  }`}
                >
                  <span className="block text-sm font-medium">{ROLE_LABEL[id]}</span>
                  <span className="mt-1 block text-[12px] text-ink-subtle">{ROLE_NOTE[id]}</span>
                </button>
              )
            })}
          </div>
        </div>

        {error ? <p className="text-sm text-accent">{error}</p> : null}
        {sent?.link ? (
          <div className="rounded-md bg-canvas-muted px-3 py-3">
            <p className="text-sm text-ink">Invite ready for {sent.invitation.invitedName || sent.invitation.email}.</p>
            <p className="mt-1 break-all text-[12px] text-ink-subtle">{sent.link}</p>
            {copyHint ? <p className="mt-2 text-[12px] text-ink-muted">{copyHint}</p> : null}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <button type="button" className="text-sm text-ink-muted" onClick={copyLink} disabled={busy}>
            <span className="inline-flex items-center gap-1.5">
              <IconCopy className="h-3.5 w-3.5" />
              {copied ? 'Copied' : 'Copy invite link'}
            </span>
          </button>
          <Button onClick={send} disabled={busy}>
            Create invitation
          </Button>
        </div>
      </div>
    </Sheet>
  )
}
