import { CSS } from '@dnd-kit/utilities'
import { useSortable } from '@dnd-kit/sortable'
import { differenceInCalendarDays, format, isToday, parseISO } from 'date-fns'
import type { Task } from '../features/tasks/types'

interface TaskCardProps {
  task: Task
  draggable?: boolean
}

const PRIORITY_LABEL: Record<NonNullable<Task['priority']>, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
}

const STATUS_LABEL: Record<Task['status'], string> = {
  todo: 'To Do',
  in_progress: 'In Progress',
  in_review: 'In Review',
  done: 'Done',
}

function getDueLabel(dueDate?: string) {
  if (!dueDate) {
    return null
  }

  try {
    const date = parseISO(dueDate)
    const daysUntilDue = differenceInCalendarDays(date, new Date())

    if (daysUntilDue < 0) {
      return { label: 'Overdue', tone: 'overdue' }
    }

    if (isToday(date)) {
      return { label: 'Due today', tone: 'today' }
    }

    if (daysUntilDue <= 2) {
      return { label: `Due in ${daysUntilDue}d`, tone: 'soon' }
    }

    return { label: format(date, 'MMM d'), tone: 'later' }
  } catch {
    return { label: dueDate, tone: 'later' }
  }
}

function TaskCardContent({ task }: { task: Task }) {
  const dueLabel = getDueLabel(task.dueDate)

  return (
    <>
      <p className="task-card__status-text">{STATUS_LABEL[task.status]}</p>
      <h3 className="task-card__title">{task.title}</h3>
      {task.description ? (
        <p className="task-card__description">{task.description}</p>
      ) : null}

      <footer className="task-card__meta">
        <span className={`priority-badge ${task.priority ?? 'normal'}`}>
          {PRIORITY_LABEL[task.priority ?? 'normal']}
        </span>
        {dueLabel ? <span className={`due-badge ${dueLabel.tone}`}>{dueLabel.label}</span> : null}
      </footer>
    </>
  )
}

export function TaskCard({ task, draggable = true }: TaskCardProps) {
  return draggable ? <SortableTaskCard task={task} /> : <OverlayTaskCard task={task} />
}

function OverlayTaskCard({ task }: { task: Task }) {
  return (
    <article className={`task-card overlay-card priority-${task.priority ?? 'normal'}`}>
      <TaskCardContent task={task} />
    </article>
  )
}

function SortableTaskCard({ task }: { task: Task }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: task.id,
      data: { type: 'task', status: task.status },
    })

  return (
    <article
      ref={setNodeRef}
      className={`task-card priority-${task.priority ?? 'normal'} ${isDragging ? 'is-dragging' : ''}`}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      {...attributes}
      {...listeners}
    >
      <TaskCardContent task={task} />
    </article>
  )
}
