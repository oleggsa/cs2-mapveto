import { useState } from 'react'

interface Props {
  text: string
}

export function CopyLink({ text }: Props) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <button className="room-link" onClick={copy} title="Скопировать ссылку">
      {text}
      <span className={`room-link-copied ${copied ? 'room-link-copied--show' : ''}`}>
        Скопировано
      </span>
    </button>
  )
}
