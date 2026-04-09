import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'
import type { Task, TaskStatus } from '../features/tasks/types'
import { TaskCard } from './TaskCard'

interface BoardColumnProps {
  status: TaskStatus
  title: string
  subtitle: string
  tasks: Task[]
}

const STATUS_BADGE: Record<TaskStatus, string> = {
  todo: 'Queue',
  in_progress: 'Building',
  in_review: 'Reviewing',
  done: 'Shipped',
}

export function BoardColumn({ status, title, subtitle, tasks }: BoardColumnProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: status,
    data: { type: 'column', status },
  })

  return (
    <section
      ref={setNodeRef}
      className={`board-column ${isOver ? 'is-over' : ''}`}
      data-status={status}
      aria-label={title}
    >
      <header className="board-column__header">
        <div>
          <span className={`column-tag ${status}`}>{STATUS_BADGE[status]}</span>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        <span className="board-column__count">{tasks.length}</span>
      </header>

      <div className="board-column__body">
        <SortableContext items={tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
          {tasks.length ? (
            tasks.map((task) => <TaskCard key={task.id} task={task} />)
          ) : (
            <div className="board-column__empty">
              <p>No cards here yet.</p>
              <span>Drag a task into this column or create a new one.</span>
            </div>
          )}
        </SortableContext>
      </div>
    </section>
  )
}
