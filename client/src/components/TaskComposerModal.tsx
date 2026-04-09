import { useState, type FormEvent } from 'react'
import type { TaskPriority } from '../features/tasks/types'

export interface TaskComposerValues {
  title: string
  description: string
  priority: TaskPriority
  dueDate: string
}

interface TaskComposerModalProps {
  isOpen: boolean
  isSubmitting?: boolean
  onClose: () => void
  onSubmit: (values: TaskComposerValues) => void | Promise<void>
}

const initialValues: TaskComposerValues = {
  title: '',
  description: '',
  priority: 'normal',
  dueDate: '',
}

export function TaskComposerModal({
  isOpen,
  isSubmitting = false,
  onClose,
  onSubmit,
}: TaskComposerModalProps) {
  const [values, setValues] = useState(initialValues)

  if (!isOpen) {
    return null
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!values.title.trim()) {
      return
    }

    void onSubmit(values)
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="modal-shell"
        role="dialog"
        aria-modal="true"
        aria-label="Create task"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-shell__header">
          <div>
            <p className="eyebrow">New Task</p>
            <h2>Create a card</h2>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

  <form className="task-form" onSubmit={handleSubmit}>
          <label>
            <span>Title</span>
            <input
              type="text"
              value={values.title}
              onChange={(event) => setValues((current) => ({ ...current, title: event.target.value }))}
              placeholder="What needs to get done?"
              autoFocus
            />
          </label>

          <label>
            <span>Description</span>
            <textarea
              value={values.description}
              onChange={(event) =>
                setValues((current) => ({ ...current, description: event.target.value }))
              }
              placeholder="Optional context, links, or acceptance criteria"
              rows={4}
            />
          </label>

          <div className="task-form__grid">
            <label>
              <span>Priority</span>
              <select
                value={values.priority}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    priority: event.target.value as TaskPriority,
                  }))
                }
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </select>
            </label>

            <label>
              <span>Due date</span>
              <input
                type="date"
                value={values.dueDate}
                onChange={(event) =>
                  setValues((current) => ({ ...current, dueDate: event.target.value }))
                }
              />
            </label>
          </div>

          <footer className="task-form__actions">
            <button type="button" className="secondary-button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="primary-button" disabled={isSubmitting || !values.title.trim()}>
              {isSubmitting ? 'Creating...' : 'Create task'}
            </button>
          </footer>
        </form>
      </section>
    </div>
  )
}
