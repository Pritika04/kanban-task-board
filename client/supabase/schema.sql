create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'in_review', 'done')),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  sort_order integer not null default 0,
  description text,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  due_date date,
  created_at timestamptz not null default now()
);

alter table public.tasks enable row level security;

create policy "tasks_select_own"
on public.tasks
for select
using (auth.uid() = user_id);

create policy "tasks_insert_own"
on public.tasks
for insert
with check (auth.uid() = user_id);

create policy "tasks_update_own"
on public.tasks
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "tasks_delete_own"
on public.tasks
for delete
using (auth.uid() = user_id);

create index if not exists tasks_user_id_idx on public.tasks (user_id);
create index if not exists tasks_user_status_order_idx on public.tasks (user_id, status, sort_order);
