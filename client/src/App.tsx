import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { useEffect, useMemo, useState } from 'react'
import { BoardColumn } from './components/BoardColumn'
import { TaskCard } from './components/TaskCard'
import { TaskComposerModal, type TaskComposerValues } from './components/TaskComposerModal'
import { createTask, fetchTasks, isConfigured, updateTaskOrder } from './features/tasks/api'
import { BOARD_COLUMNS, type Task, type TaskPriority, type TaskStatus } from './features/tasks/types'
import { supabase } from './lib/supabase'

type PriorityFilter = 'all' | TaskPriority
type TasksByStatus = Record<TaskStatus, Task[]>

const DEMO_TASKS: Task[] = [
  {
    id: 'demo-1',
    title: 'Define launch checklist for assessment delivery',
    description: 'Cover QA, schema export, deployment and final document checklist.',
    status: 'todo',
    order: 0,
    priority: 'high',
    dueDate: '2026-04-10',
  },
  {
    id: 'demo-2',
    title: 'Craft empty and loading states for each board lane',
    status: 'todo',
    order: 1,
    priority: 'normal',
  },
  {
    id: 'demo-3',
    title: 'Build task card with visual hierarchy and metadata',
    description: 'Title, description preview, priority and due date chips.',
    status: 'in_progress',
    order: 0,
    priority: 'high',
    dueDate: '2026-04-09',
  },
  {
    id: 'demo-4',
    title: 'Connect drag interactions with optimistic local state',
    status: 'in_progress',
    order: 1,
    priority: 'normal',
  },
  {
    id: 'demo-5',
    title: 'Review Supabase RLS policy for guest isolation',
    description: 'Ensure auth.uid() owns read and write access for each task row.',
    status: 'in_review',
    order: 0,
    priority: 'high',
    dueDate: '2026-04-08',
  },
  {
    id: 'demo-6',
    title: 'Publish live demo and verify mobile board behavior',
    status: 'done',
    order: 0,
    priority: 'low',
  },
]

function createEmptyBoard(): TasksByStatus {
  return {
    todo: [],
    in_progress: [],
    in_review: [],
    done: [],
  }
}

function groupTasksByStatus(tasks: Task[]): TasksByStatus {
  return tasks.reduce((acc, task) => {
    acc[task.status].push(task)
    return acc
  }, createEmptyBoard())
}

function normalizeTasks(tasks: Task[]): Task[] {
  const grouped = groupTasksByStatus(tasks)
  const ordered = BOARD_COLUMNS.flatMap((column) =>
    grouped[column.status]
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((task, index) => ({ ...task, order: index, status: column.status })),
  )

  return ordered
}

function applyFilters(tasks: Task[], query: string, priorityFilter: PriorityFilter): Task[] {
  const normalizedQuery = query.trim().toLowerCase()

  return tasks.filter((task) => {
    const matchesQuery =
      normalizedQuery.length === 0 ||
      task.title.toLowerCase().includes(normalizedQuery) ||
      (task.description ?? '').toLowerCase().includes(normalizedQuery)
    const matchesPriority = priorityFilter === 'all' || task.priority === priorityFilter
    return matchesQuery && matchesPriority
  })
}

function sortForDisplay(tasks: Task[]): TasksByStatus {
  const grouped = groupTasksByStatus(tasks)

  return BOARD_COLUMNS.reduce((acc, column) => {
    acc[column.status] = grouped[column.status].slice().sort((a, b) => a.order - b.order)
    return acc
  }, createEmptyBoard())
}

function findDropTargetStatus(tasks: Task[], overId: string): TaskStatus | null {
  const column = BOARD_COLUMNS.find((item) => item.status === overId)
  if (column) {
    return column.status
  }

  const targetTask = tasks.find((task) => task.id === overId)
  return targetTask?.status ?? null
}

function moveTask(tasks: Task[], activeId: string, overId: string): Task[] {
  const activeTask = tasks.find((task) => task.id === activeId)
  const targetStatus = findDropTargetStatus(tasks, overId)

  if (!activeTask || !targetStatus) {
    return tasks
  }

  const grouped = sortForDisplay(tasks)
  const sourceTasks = grouped[activeTask.status].slice()

  const sourceIndex = sourceTasks.findIndex((task) => task.id === activeId)
  if (sourceIndex < 0) {
    return tasks
  }

  const [movingTask] = sourceTasks.splice(sourceIndex, 1)

  if (activeTask.status === targetStatus) {
    const targetTasks = sourceTasks
    const overIndex = targetTasks.findIndex((task) => task.id === overId)
    const insertIndex = overIndex >= 0 ? overIndex : targetTasks.length
    targetTasks.splice(insertIndex, 0, movingTask)

    grouped[targetStatus] = targetTasks.map((task, index) => ({
      ...task,
      status: targetStatus,
      order: index,
    }))
  } else {
    const targetTasks = grouped[targetStatus].slice()
    const overIndex = targetTasks.findIndex((task) => task.id === overId)
    const insertIndex = overIndex >= 0 ? overIndex : targetTasks.length
    targetTasks.splice(insertIndex, 0, { ...movingTask, status: targetStatus })

    grouped[activeTask.status] = sourceTasks.map((task, index) => ({
      ...task,
      status: activeTask.status,
      order: index,
    }))

    grouped[targetStatus] = targetTasks.map((task, index) => ({
      ...task,
      status: targetStatus,
      order: index,
    }))
  }

  return normalizeTasks(BOARD_COLUMNS.flatMap((column) => grouped[column.status]))
}

function formatAppError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message
  }

  if (error && typeof error === 'object') {
    const candidate = error as { message?: string; details?: string; hint?: string; code?: string }
    const parts = [candidate.message, candidate.details, candidate.hint].filter(
      (value): value is string => Boolean(value && value.trim()),
    )

    if (parts.length > 0) {
      return parts.join(' | ')
    }

    if (candidate.code) {
      return `Request failed with code ${candidate.code}.`
    }
  }

  return fallback
}

function reportAppError(error: unknown, fallback: string): void {
  if (!import.meta.env.DEV) {
    return
  }

  const message = formatAppError(error, fallback)
  console.error(`[Next Play Task Board] ${message}`, error)
}

function App() {
  const configured = isConfigured()
  const [tasks, setTasks] = useState<Task[]>(configured ? [] : DEMO_TASKS)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [isBootstrapping, setIsBootstrapping] = useState(configured)
  const [isLoadingBoard, setIsLoadingBoard] = useState(configured)
  const [isSubmittingTask, setIsSubmittingTask] = useState(false)
  const [isSyncingBoard, setIsSyncingBoard] = useState(false)
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all')
  const [isComposerOpen, setIsComposerOpen] = useState(false)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const supabaseClient = supabase

  useEffect(() => {
    if (!configured || !supabaseClient) {
      setIsBootstrapping(false)
      setIsLoadingBoard(false)
      setTasks(DEMO_TASKS)
      return
    }

    const client = supabaseClient!

    let mounted = true

    async function bootstrapSession() {
      try {
        const { data: sessionResult, error: sessionError } = await client.auth.getSession()
        if (sessionError) {
          throw sessionError
        }

        let session = sessionResult.session

        if (!session) {
          const { data: signInResult, error: signInError } = await client.auth.signInAnonymously()
          if (signInError) {
            throw signInError
          }

          session = signInResult.session
        }

        if (!mounted) {
          return
        }

        setCurrentUserId(session?.user.id ?? null)
      } catch (bootstrapError) {
        if (!mounted) {
          return
        }

        reportAppError(bootstrapError, 'Unable to start guest session.')
      } finally {
        if (mounted) {
          setIsBootstrapping(false)
        }
      }
    }

    bootstrapSession()

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      if (!mounted) {
        return
      }

      setCurrentUserId(session?.user.id ?? null)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [configured, supabaseClient])

  useEffect(() => {
    if (!configured || !supabaseClient || !currentUserId) {
      return
    }

    const userId = currentUserId!

    let mounted = true

    async function loadBoard() {
      setIsLoadingBoard(true)

      try {
        const nextTasks = await fetchTasks(userId)
        if (mounted) {
          setTasks(nextTasks)
        }
      } catch (loadError) {
        if (mounted) {
          reportAppError(loadError, 'Unable to load your tasks.')
        }
      } finally {
        if (mounted) {
          setIsLoadingBoard(false)
        }
      }
    }

    void loadBoard()

    return () => {
      mounted = false
    }
  }, [configured, currentUserId, supabaseClient])

  const filteredTasks = useMemo(
    () => applyFilters(tasks, query, priorityFilter),
    [tasks, query, priorityFilter],
  )

  const visibleTasksByStatus = useMemo(
    () => sortForDisplay(filteredTasks),
    [filteredTasks],
  )

  const activeTask = useMemo(
    () => tasks.find((task) => task.id === activeTaskId) ?? null,
    [activeTaskId, tasks],
  )

  const completedCount = tasks.filter((task) => task.status === 'done').length
  const hasActiveFilters = query.trim().length > 0 || priorityFilter !== 'all'
  const todayLabel = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date())
  const dueSoonCount = tasks.filter((task) => {
    if (!task.dueDate || task.status === 'done') {
      return false
    }

    const dueDate = new Date(task.dueDate)
    const daysUntilDue = Math.ceil(
      (dueDate.getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000,
    )

    return daysUntilDue <= 2
  }).length

  const completionRate = tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0
  const urgencyRate = tasks.length > 0 ? Math.round((dueSoonCount / tasks.length) * 100) : 0

  const boardStatusMessage = configured
    ? currentUserId
      ? 'Anonymous session ready. Tasks are scoped to your guest account.'
      : 'Starting guest session...'
    : 'Supabase is not configured. The board is showing local demo data until you add env vars.'

  async function handleCreateTask(values: TaskComposerValues) {
    const title = values.title.trim()
    if (!title) {
      return
    }

    if (configured && supabaseClient && currentUserId) {
      setIsSubmittingTask(true)

      try {
        const created = await createTask(currentUserId, {
          title,
          description: values.description.trim() || undefined,
          priority: values.priority,
          dueDate: values.dueDate || undefined,
        })

        setTasks((currentTasks) => normalizeTasks([...currentTasks, created]))
        setIsComposerOpen(false)
      } catch (createError) {
        reportAppError(createError, 'Unable to create the task.')
      } finally {
        setIsSubmittingTask(false)
      }

      return
    }

    if (configured) {
      reportAppError(new Error('Guest session is still starting.'), 'Guest session is still starting.')
      return
    }

    const localTask: Task = {
      id: crypto.randomUUID(),
      title,
      status: 'todo',
      order: tasks.filter((task) => task.status === 'todo').length,
      description: values.description.trim() || undefined,
      priority: values.priority,
      dueDate: values.dueDate || undefined,
      createdAt: new Date().toISOString(),
    }

    setTasks((currentTasks) => normalizeTasks([...currentTasks, localTask]))
    setIsComposerOpen(false)
  }

  async function handleDragStart(event: DragStartEvent) {
    setActiveTaskId(String(event.active.id))
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveTaskId(null)

    if (!over) {
      return
    }

    const activeId = String(active.id)
    const overId = String(over.id)
    const nextTasks = moveTask(tasks, activeId, overId)

    if (nextTasks === tasks) {
      return
    }

    const previousTasks = tasks
    setTasks(nextTasks)

    if (!configured || !supabaseClient || !currentUserId) {
      return
    }

    setIsSyncingBoard(true)

    try {
      await updateTaskOrder(nextTasks)
    } catch (syncError) {
      setTasks(previousTasks)
      reportAppError(syncError, 'Unable to save the move.')
    } finally {
      setIsSyncingBoard(false)
    }
  }

  return (
    <main className="app-shell">
      <div className="backdrop" aria-hidden="true" />

      <header className="board-top">
        <div>
          <p className="eyebrow">Product Planning</p>
          <h1>Next Play Task Board</h1>
          <p className="board-subtitle">
            A polished execution board for shipping work with clarity, momentum, and ownership.
          </p>
          <div className="board-meta-row" aria-label="Board metadata">
            <span className="ghost-pill">{todayLabel}</span>
          </div>
          <p className={`board-status ${configured ? 'live' : 'demo'}`}>{boardStatusMessage}</p>
        </div>

        <div className="board-actions">
          <span className="ghost-pill">Guest Workspace</span>
          <button
            type="button"
            className="primary-button"
            onClick={() => setIsComposerOpen(true)}
            disabled={isBootstrapping || isLoadingBoard}
          >
            + New Task
          </button>
          {isSyncingBoard ? <span className="sync-pill">Saving changes…</span> : null}
        </div>
      </header>

      <section className="stats-strip" aria-label="Board summary">
        <article>
          <p>Total</p>
          <strong>{tasks.length}</strong>
          <div className="stat-meter"><span style={{ width: '100%' }} /></div>
        </article>
        <article>
          <p>Completed</p>
          <strong>{completedCount}</strong>
          <div className="stat-meter"><span style={{ width: `${completionRate}%` }} /></div>
        </article>
        <article>
          <p>Due Soon</p>
          <strong>{dueSoonCount}</strong>
          <div className="stat-meter warning"><span style={{ width: `${urgencyRate}%` }} /></div>
        </article>
      </section>

      <section className="toolbar" aria-label="Search and filters">
        <label>
          <span>Search</span>
          <input
            type="text"
            placeholder="Search by title or description"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label>
          <span>Priority</span>
          <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value as PriorityFilter)}>
            <option value="all">All priorities</option>
            <option value="high">High</option>
            <option value="normal">Normal</option>
            <option value="low">Low</option>
          </select>
        </label>
      </section>

      {!isBootstrapping && !isLoadingBoard && tasks.length === 0 ? (
        <section className="empty-board">
          <h2>Your board is ready.</h2>
          <p>Create your first task to start planning your work.</p>
          <button type="button" className="secondary-button" onClick={() => setIsComposerOpen(true)}>
            Create first task
          </button>
        </section>
      ) : null}

      {!isBootstrapping && !isLoadingBoard && tasks.length > 0 && filteredTasks.length === 0 && hasActiveFilters ? (
        <section className="filter-empty-note">
          <p>No tasks match the current filters.</p>
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              setQuery('')
              setPriorityFilter('all')
            }}
          >
            Reset filters
          </button>
        </section>
      ) : null}

      {isBootstrapping || isLoadingBoard ? (
        <section className="loading-panel" aria-live="polite">
          <div className="loading-card loading-card--wide" />
          <div className="loading-grid">
            {BOARD_COLUMNS.map((column) => (
              <div key={column.status} className="loading-card loading-card--column" />
            ))}
          </div>
        </section>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <section className="board-grid" aria-label="Kanban board">
            {BOARD_COLUMNS.map((column) => (
              <BoardColumn
                key={column.status}
                status={column.status}
                title={column.title}
                subtitle={column.subtitle}
                tasks={visibleTasksByStatus[column.status]}
              />
            ))}
          </section>

          <DragOverlay>
            {activeTask ? <TaskCard task={activeTask} draggable={false} /> : null}
          </DragOverlay>
        </DndContext>
      )}

      {isComposerOpen ? (
        <TaskComposerModal
          isOpen={isComposerOpen}
          isSubmitting={isSubmittingTask}
          onClose={() => setIsComposerOpen(false)}
          onSubmit={handleCreateTask}
        />
      ) : null}
    </main>
  )
}

export default App