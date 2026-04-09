import { supabase, isSupabaseConfigured } from '../../lib/supabase'
import type { Task, TaskPriority, TaskStatus } from './types'

export interface TaskInput {
  title: string
  description?: string
  priority?: TaskPriority
  dueDate?: string
}

interface TaskRow {
  id: string
  title: string
  status: TaskStatus
  user_id: string
  sort_order: number
  description?: string | null
  priority?: TaskPriority | null
  due_date?: string | null
  created_at: string
}

const FULL_TASK_SELECT = 'id,title,status,user_id,sort_order,description,priority,due_date,created_at'
const CORE_TASK_SELECT = 'id,title,status,user_id,sort_order,created_at'

function isSchemaColumnMismatch(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }

  const candidate = error as { code?: string; message?: string; details?: string; hint?: string }
  const searchable = `${candidate.message ?? ''} ${candidate.details ?? ''} ${candidate.hint ?? ''}`.toLowerCase()

  return (
    candidate.code === 'PGRST204' ||
    searchable.includes('column') ||
    searchable.includes('does not exist') ||
    searchable.includes('could not find')
  )
}

function assertSupabase() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
  }

  return supabase
}

export function isConfigured() {
  return isSupabaseConfigured
}

export function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    order: row.sort_order,
    description: row.description ?? undefined,
    priority: row.priority ?? undefined,
    dueDate: row.due_date ?? undefined,
  }
}

export async function fetchTasks(userId: string): Promise<Task[]> {
  const client = assertSupabase()

  const fullQuery = await client
    .from('tasks')
    .select(FULL_TASK_SELECT)
    .eq('user_id', userId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (!fullQuery.error) {
    return (fullQuery.data ?? []).map(toTask)
  }

  if (!isSchemaColumnMismatch(fullQuery.error)) {
    throw fullQuery.error
  }

  const coreQuery = await client
    .from('tasks')
    .select(CORE_TASK_SELECT)
    .eq('user_id', userId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (coreQuery.error) {
    throw coreQuery.error
  }

  return (coreQuery.data ?? []).map(toTask)
}

export async function createTask(userId: string, input: TaskInput): Promise<Task> {
  const client = assertSupabase()

  const fullInsert = await client
    .from('tasks')
    .insert({
      user_id: userId,
      title: input.title,
      status: 'todo',
      sort_order: 0,
      description: input.description ?? null,
      priority: input.priority ?? 'normal',
      due_date: input.dueDate ?? null,
    })
    .select(FULL_TASK_SELECT)
    .single()

  if (!fullInsert.error) {
    return toTask(fullInsert.data)
  }

  if (!isSchemaColumnMismatch(fullInsert.error)) {
    throw fullInsert.error
  }

  const coreInsert = await client
    .from('tasks')
    .insert({
      user_id: userId,
      title: input.title,
      status: 'todo',
      sort_order: 0,
    })
    .select(CORE_TASK_SELECT)
    .single()

  if (coreInsert.error) {
    throw coreInsert.error
  }

  return toTask(coreInsert.data)
}

export async function updateTaskOrder(tasks: Task[]): Promise<void> {
  const client = assertSupabase()

  const updates = tasks.map((task) =>
    client
      .from('tasks')
      .update({ status: task.status, sort_order: task.order })
      .eq('id', task.id),
  )

  const results = await Promise.all(updates)

  const error = results.find((result) => result.error)?.error
  if (error) {
    throw error
  }
}
