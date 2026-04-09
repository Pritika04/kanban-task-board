export type TaskStatus = 'todo' | 'in_progress' | 'in_review' | 'done'

export type TaskPriority = 'low' | 'normal' | 'high'

export interface Task {
  id: string
  title: string
  status: TaskStatus
  order: number
  description?: string
  priority?: TaskPriority
  dueDate?: string
  createdAt?: string
}

export const BOARD_COLUMNS: Array<{
  status: TaskStatus
  title: string
  subtitle: string
}> = [
  {
    status: 'todo',
    title: 'To Do',
    subtitle: 'Shaped and ready for execution',
  },
  {
    status: 'in_progress',
    title: 'In Progress',
    subtitle: 'Actively being built and refined',
  },
  {
    status: 'in_review',
    title: 'In Review',
    subtitle: 'Awaiting checks and alignment',
  },
  {
    status: 'done',
    title: 'Done',
    subtitle: 'Shipped and documented',
  },
]
