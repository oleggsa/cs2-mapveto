import { useState } from 'react'

interface Props {
  text: string
  compact?: boolean
}

export function CopyLink({ text, compact }: Props) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  if (compact) {
    return (
      <button className="icon-btn copy-link-icon" onClick={copy} title="Скопировать ссылку">
        🔗
        <span className={`room-link-copied ${copied ? 'room-link-copied--show' : ''}`}>Скопировано</span>
      </button>
    )
  }

  return (
    <button className="room-link" onClick={copy} title="Скопировать ссылку">
      <span className="room-link-text">{text}</span>
      <span className={`room-link-copied ${copied ? 'room-link-copied--show' : ''}`}>
        Скопировано
      </span>
    </button>
  )
}
