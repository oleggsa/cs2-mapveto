import { useState } from 'react'

interface Props {
  title: string
  description: string
  confirmWord?: string
  onConfirm: () => void
  onCancel: () => void
}

const DEFAULT_WORD = 'УДАЛИТЬ'

/** Destructive-action confirmation — requires typing a word exactly, not
 * just clicking a button, so it can't be dismissed by reflex. */
export function ConfirmDeleteModal({ title, description, confirmWord = DEFAULT_WORD, onConfirm, onCancel }: Props) {
  const [value, setValue] = useState('')
  const canConfirm = value.trim().toUpperCase() === confirmWord.toUpperCase()

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') onCancel()
    if (e.key === 'Enter' && canConfirm) onConfirm()
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        <p className="modal-description">{description}</p>
        <p className="modal-hint">
          Введите <strong>{confirmWord}</strong>, чтобы подтвердить.
        </p>
        <input
          className="text-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={confirmWord}
          autoFocus
        />
        <div className="modal-actions">
          <button className="btn btn-sm" onClick={onCancel}>
            Отмена
          </button>
          <button className="btn btn-danger" onClick={onConfirm} disabled={!canConfirm}>
            Удалить
          </button>
        </div>
      </div>
    </div>
  )
}
