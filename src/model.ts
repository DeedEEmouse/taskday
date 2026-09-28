export type Kind = 'once' | 'daily' | 'interval' | 'weekly' | 'monthly' | 'yearly'
export type Mode = 'manual' | 'weighted' | 'equal'

export type Task = {
  id: string
  user_id: string
  title: string
  kind: Kind
  points: number
  weight: number
  interval_days: number | null
  anchor_date: string | null
  weekdays: number[]
  day_of_month: number | null
  month_of_year: number | null
  created_on: string
  archived_on: string | null
  sort_order: number
}

export type Completion = {
  id: string
  user_id: string
  task_id: string
  occurrence_key: string
  completed_on: string
  awarded_points: number
}

export type Store = { tasks: Task[]; completions: Completion[]; mode: Mode }

export const dateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

export const parseDate = (key: string) => {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export const shiftDate = (key: string, days: number) => {
  const date = parseDate(key)
  date.setDate(date.getDate() + days)
  return dateKey(date)
}

export const formatDate = (key: string) =>
  new Intl.DateTimeFormat('zh-TW', { month: 'long', day: 'numeric', weekday: 'long' }).format(parseDate(key))

export function isDue(task: Task, key: string) {
  if (key < task.created_on || (task.archived_on && key >= task.archived_on)) return false
  if (task.kind === 'once') return task.anchor_date === key
  if (task.kind === 'daily') return true
  const date = parseDate(key)
  if (task.kind === 'weekly') return task.weekdays.includes(date.getDay())
  if (task.kind === 'monthly') return date.getDate() === task.day_of_month
  if (task.kind === 'yearly') return date.getMonth() + 1 === task.month_of_year && date.getDate() === task.day_of_month
  if (task.kind === 'interval' && task.anchor_date) {
    const [ay, am, ad] = task.anchor_date.split('-').map(Number)
    const [y, m, d] = key.split('-').map(Number)
    const diff = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ay, am - 1, ad)) / 86_400_000)
    return diff >= 0 && diff % ((task.interval_days ?? 1) + 1) === 0
  }
  return false
}

export function allocateForDay(tasks: Task[], mode: Mode): Map<string, number> {
  if (!tasks.length) return new Map()
  const ordered = [...tasks].sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id))
  const weights = ordered.map(t => mode === 'equal' ? 1 : Math.max(1, mode === 'weighted' ? t.weight : t.points))
  const weightSum = weights.reduce((a, b) => a + b, 0)
  const base = ordered.length <= 100 ? 1 : 0
  const remaining = 100 - base * ordered.length
  const fractions = weights.map(w => remaining * w / weightSum)
  const shares = fractions.map(f => Math.floor(f) + base)
  const left = 100 - shares.reduce((a, b) => a + b, 0)
  const order = fractions.map((f, i) => ({ i, fraction: f - Math.floor(f) }))
    .sort((a, b) => b.fraction - a.fraction || a.i - b.i)
  for (let i = 0; i < left; i++) shares[order[i].i]++
  return new Map(ordered.map((task, i) => [task.id, shares[i]]))
}

export function scoreForDay(store: Store, key: string) {
  const daily = store.tasks.filter(t => t.kind === 'daily' && isDue(t, key))
  const due = store.tasks.filter(t => isDue(t, key))
  const done = store.completions.filter(c => c.occurrence_key === key)
  const doneIds = new Set(done.map(c => c.task_id))
  const allocation = allocateForDay(due, store.mode)
  const doneCount = due.filter(t => doneIds.has(t.id)).length
  const allowedMisses = due.length >= 10 ? 2 : due.length >= 6 ? 1 : 0
  const bonus = due.length > 0 && due.length - doneCount <= allowedMisses ? 20 : 0
  const points = due.reduce((sum, task) => sum + (doneIds.has(task.id) ? allocation.get(task.id) ?? 0 : 0), 0) + bonus
  return { due, daily, doneIds, allocation, bonus, points, doneCount, allowedMisses, dailyDone: daily.filter(t => doneIds.has(t.id)).length }
}

export function makeTask(title: string, kind: Kind, today: string, userId: string, order: number): Task {
  return {
    id: crypto.randomUUID(), user_id: userId, title: title.trim(), kind,
    points: 10, weight: 1, interval_days: kind === 'interval' ? 1 : null,
    anchor_date: kind === 'interval' || kind === 'once' ? today : null,
    weekdays: kind === 'weekly' ? [parseDate(today).getDay()] : [],
    day_of_month: kind === 'monthly' || kind === 'yearly' ? parseDate(today).getDate() : null,
    month_of_year: kind === 'yearly' ? parseDate(today).getMonth() + 1 : null,
    created_on: today, archived_on: null, sort_order: order,
  }
}

export function seedDemo(today: string): Store {
  const names = ['閱讀 30 分鐘', '運動或散步', '整理今日筆記', '睡前回顧']
  const tasks = names.map((name, i) => ({ ...makeTask(name, 'daily', today, 'demo', i), points: 25 }))
  const weekly = { ...makeTask('整理一週進度', 'weekly', today, 'demo', 4), weekdays: [parseDate(today).getDay()] }
  return { tasks: [...tasks, weekly], completions: [], mode: 'equal' }
}
