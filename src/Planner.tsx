import { useEffect, useRef, useState, type FormEvent, type PointerEvent } from 'react'
import { ArrowLeft, ArrowRight, CalendarDays, Check, Link2, Plus, Trash2, X } from 'lucide-react'
import { formatDate, shiftDate, type Task } from './model'
import './planner.css'

export type Lane = 'planned' | 'actual'
export type ScheduleEntry = {
  id: string
  user_id: string
  day: string
  start_time: string
  end_time: string
  start_hour: number
  end_hour: number
  lane: Lane
  title: string
  notes: string
  status: 'planned' | 'done'
  task_id: string | null
}
type Props = {
  day: string
  onDayChange: (date: string) => void
  entries: ScheduleEntry[]
  userId: string
  busy: boolean
  tasks: Task[]
  doneIds: Set<string>
  onToggleTask: (task: Task) => Promise<void>
  onSave: (entry: ScheduleEntry) => Promise<boolean>
  onDelete: (entry: ScheduleEntry) => Promise<boolean>
}
type Selection = { lane: Lane; start: number; end: number }
type Gesture = { kind: 'select'; lane: Lane; anchor: number; last: number } | { kind: 'move'; entry: ScheduleEntry; activated: boolean; target: number; timer: ReturnType<typeof setTimeout> }
const FIRST = 8
const LAST = 26
const hours = Array.from({ length: LAST - FIRST }, (_, i) => FIRST + i)
const label = (hour: number) => `${String(hour % 24).padStart(2, '0')}:00`
const localDay = () => {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
const newEntry = (userId: string, day: string, lane: Lane, start: number, end: number): ScheduleEntry => ({
  id: crypto.randomUUID(), user_id: userId, day, lane, start_hour: start, end_hour: end,
  start_time: label(start), end_time: label(end), title: '', notes: '', status: 'planned', task_id: null,
})

export default function Planner({ day, onDayChange, entries, userId, busy, tasks, doneIds, onToggleTask, onSave, onDelete }: Props) {
  const [editing, setEditing] = useState<ScheduleEntry | null>(null)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [moving, setMoving] = useState<string | null>(null)
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const gesture = useRef<Gesture | null>(null)
  const board = useRef<HTMLDivElement | null>(null)
  const items = entries.filter(item => item.day === day).sort((a, b) => a.start_hour - b.start_hour)
  const linked = (entry: ScheduleEntry) => tasks.find(task => task.id === entry.task_id)
  const completed = (entry: ScheduleEntry) => entry.task_id && linked(entry) ? doneIds.has(entry.task_id) : entry.status === 'done'
  const conflicts = (lane: Lane, start: number, end: number, except?: string) => items.some(item => item.lane === lane && item.id !== except && start < item.end_hour && end > item.start_hour)
  useEffect(() => { setSelection(null); setEditing(null); setMoving(null); if (gesture.current?.kind === 'move') clearTimeout(gesture.current.timer); gesture.current = null }, [day])
  useEffect(() => () => { if (gesture.current?.kind === 'move') clearTimeout(gesture.current.timer) }, [])

  function openNew(lane: Lane, start: number, end: number) {
    setEditing(newEntry(userId, day, lane, start, end))
    setFormError('')
    setSelection(null)
  }
  function planTask(task: Task) {
    const hour = hours.find(hour => hour >= 9 && !conflicts('planned', hour, hour + 1))
    if (hour === undefined) { setFormError('預計欄已排滿，請先調整時段。'); return }
    setEditing({ ...newEntry(userId, day, 'planned', hour, hour + 1), task_id: task.id, title: task.title })
    setFormError('')
  }
  function cellAt(x: number, y: number): { lane: Lane; hour: number } | null {
    const element = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-lane][data-hour]')
    if (!element || !board.current?.contains(element)) return null
    return { lane: element.dataset.lane as Lane, hour: Number(element.dataset.hour) }
  }
  function pointerDown(event: PointerEvent<HTMLElement>) {
    if (busy || editing || event.pointerType === 'mouse' && event.button !== 0) return
    const card = (event.target as HTMLElement).closest<HTMLElement>('[data-entry]')
    if (card) {
      const entry = items.find(item => item.id === card.dataset.entry)
      if (!entry) return
      const timer = setTimeout(() => { const g = gesture.current; if (g?.kind === 'move' && g.entry.id === entry.id) { g.activated = true; setMoving(entry.id); navigator.vibrate?.(18) } }, 320)
      gesture.current = { kind: 'move', entry, activated: false, target: entry.start_hour, timer }
    } else {
      const cell = cellAt(event.clientX, event.clientY)
      if (!cell || conflicts(cell.lane, cell.hour, cell.hour + 1)) return
      gesture.current = { kind: 'select', lane: cell.lane, anchor: cell.hour, last: cell.hour }
      setSelection({ lane: cell.lane, start: cell.hour, end: cell.hour + 1 })
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  function pointerMove(event: PointerEvent<HTMLElement>) {
    const g = gesture.current
    if (!g) return
    const cell = cellAt(event.clientX, event.clientY)
    if (g.kind === 'select' && cell?.lane === g.lane) {
      g.last = cell.hour
      const start = Math.min(g.anchor, cell.hour)
      const end = Math.max(g.anchor, cell.hour) + 1
      setSelection({ lane: g.lane, start, end })
    } else if (g.kind === 'move' && g.activated && cell?.lane === g.entry.lane) {
      g.target = Math.min(cell.hour, LAST - (g.entry.end_hour - g.entry.start_hour))
      setSelection({ lane: g.entry.lane, start: g.target, end: g.target + g.entry.end_hour - g.entry.start_hour })
    }
  }
  function pointerEnd(event: PointerEvent<HTMLElement>) {
    const g = gesture.current
    gesture.current = null
    setMoving(null)
    if (!g) { setSelection(null); return }
    if (g.kind === 'move') {
      clearTimeout(g.timer)
      if (!g.activated) { setEditing({ ...g.entry }); setFormError('') }
      else if (g.target !== g.entry.start_hour) {
        const start = g.target, end = start + g.entry.end_hour - g.entry.start_hour
        if (!conflicts(g.entry.lane, start, end, g.entry.id)) void onSave({ ...g.entry, start_hour: start, end_hour: end, start_time: label(start), end_time: label(end) })
      }
    } else {
      const start = Math.min(g.anchor, g.last), end = Math.max(g.anchor, g.last) + 1
      if (conflicts(g.lane, start, end)) setFormError('所選時段與現有行程重疊，請選擇空白時段。')
      else openNew(g.lane, start, end)
    }
    setSelection(null)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!editing) return
    if (editing.start_hour < 0 || editing.end_hour > 26 || editing.end_hour <= editing.start_hour) { setFormError('請選擇有效的起訖時間。'); return }
    if (conflicts(editing.lane, editing.start_hour, editing.end_hour, editing.id)) { setFormError('此欄位的時段與現有行程重疊。'); return }
    const title = editing.title.trim() || tasks.find(t => t.id === editing.task_id)?.title || ''
    if (!title) { setFormError('請輸入內容或連結待辦。'); return }
    setSubmitting(true)
    const saved = await onSave({ ...editing, title, start_time: label(editing.start_hour), end_time: label(editing.end_hour) })
    setSubmitting(false)
    if (saved) setEditing(null)
    else setFormError('儲存失敗，請再試一次。')
  }
  async function toggleEntry(entry: ScheduleEntry) {
    const task = linked(entry)
    if (task) await onToggleTask(task)
    else await onSave({ ...entry, status: entry.status === 'done' ? 'planned' : 'done' })
  }
  const todo = tasks.filter(t => !doneIds.has(t.id))
  const done = tasks.filter(t => doneIds.has(t.id))
  return <>
    <div className="page-heading"><div><span className="eyebrow">DEVELOPER BETA</span><h1>一日行程表<span className="heading-dot">.</span></h1><p>左邊寫預計，右邊記實際；把待辦放進行程，完成狀態會同步。</p></div><button className="primary add-task" aria-label="新增行程" onClick={() => openNew('planned', 9, 10)}><Plus size={18}/><span className="add-task-label">新增行程</span></button></div>
    <div className="date-controls"><div className="date-current"><CalendarDays size={18}/><strong>{formatDate(day)}</strong>{day === localDay() && <span className="today-pill">今天</span>}</div><div className="date-buttons"><button aria-label="前一天" onClick={() => onDayChange(shiftDate(day, -1))}><ArrowLeft size={18}/></button><button className="today-button" onClick={() => onDayChange(localDay())}>回到今天</button><button aria-label="後一天" onClick={() => onDayChange(shiftDate(day, 1))}><ArrowRight size={18}/></button></div></div>
    <p className="timeline-help">點選或拖選空格，輸入相同內容到連續時段。點方塊編輯；長按方塊再拖動，可調整時間。</p>
    {formError && !editing && <p className="validation" role="alert">{formError}</p>}
    <div className="schedule-board" ref={board} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={() => { if (gesture.current?.kind === 'move') clearTimeout(gesture.current.timer); gesture.current = null; setMoving(null); setSelection(null) }}>
      <div className="schedule-header">預計要做</div><div className="schedule-header schedule-clock">時間</div><div className="schedule-header">實際做了</div>
      {hours.map(hour => <div className="schedule-row" key={hour}>
        <div className="schedule-cell" data-lane="planned" data-hour={hour} aria-label={`預計 ${label(hour)} 至 ${label(hour + 1)}`}/>
        <div className="schedule-hour">{label(hour)}</div>
        <div className="schedule-cell" data-lane="actual" data-hour={hour} aria-label={`實際 ${label(hour)} 至 ${label(hour + 1)}`}/>
      </div>)}
      {selection && <div className={`schedule-selection ${selection.lane}`} style={{ top: `calc(44px + ${selection.start - FIRST} * var(--hour-height))`, height: `calc(${selection.end - selection.start} * var(--hour-height))` }}/>} 
      {items.filter(item => item.start_hour >= FIRST && item.end_hour <= LAST).map(entry => <div key={entry.id} data-entry={entry.id} className={`schedule-block ${entry.lane} ${completed(entry) ? 'is-done' : ''} ${moving === entry.id ? 'is-moving' : ''}`} style={{ top: `calc(44px + ${entry.start_hour - FIRST} * var(--hour-height) + 3px)`, height: `calc(${entry.end_hour - entry.start_hour} * var(--hour-height) - 6px)` }} role="button" tabIndex={0} aria-label={`${entry.lane === 'planned' ? '預計' : '實際'} ${label(entry.start_hour)} 到 ${label(entry.end_hour)} ${linked(entry)?.title ?? entry.title}，點擊編輯，長按拖動`} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setEditing({ ...entry }); setFormError('') } }}>
        <strong>{linked(entry)?.title ?? entry.title}</strong><span>{label(entry.start_hour)}–{label(entry.end_hour)} {entry.task_id && <Link2 size={12}/>}</span>
      </div>)}
    </div>
    {items.some(item => item.start_hour < FIRST) && <p className="timeline-help">舊行程中早於 08:00 的時段：{items.filter(item => item.start_hour < FIRST).map(item => `${label(item.start_hour)} ${item.title}`).join('、')}。可用下方「新增行程」重新安排。</p>}
    <section className="planner-todos"><div className="section-title"><div><h2>今天的待辦</h2><p>點待辦可切換完成狀態；行程中連結的方塊會一起更新。</p></div></div><div className="todo-columns"><div className="todo-group"><h3>待完成 <span>{todo.length}</span></h3>{todo.map(task => <div className="planner-todo-line" key={task.id}><button className="todo-item" disabled={busy || day > localDay()} onClick={() => void onToggleTask(task)}><span className="checkbox"/>{task.title}</button><button className="plan-from-todo" onClick={() => planTask(task)} disabled={busy}>安排</button></div>)}{!todo.length && <p className="todo-empty">今天的待辦都完成了。</p>}</div><div className="todo-group done"><h3>已完成 <span>{done.length}</span></h3>{done.map(task => <button className="todo-item" key={task.id} disabled={busy || day > localDay()} onClick={() => void onToggleTask(task)}><span className="checkbox"><Check size={15}/></span>{task.title}</button>)}{!done.length && <p className="todo-empty">完成後會移到這裡。</p>}</div></div></section>
    {editing && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setEditing(null) }}><div className="modal" role="dialog" aria-modal="true" aria-label="編輯行程"><div className="modal-head"><div><span className="eyebrow">DAILY SCHEDULE</span><h2>{items.some(item => item.id === editing.id) ? '編輯時段' : '新增時段'}</h2></div><button className="icon-button" aria-label="關閉" onClick={() => setEditing(null)}><X size={20}/></button></div><form onSubmit={submit}>
      <div className="field-grid"><label className="field">欄位<select value={editing.lane} onChange={event => setEditing({ ...editing, lane: event.target.value as Lane })}><option value="planned">預計要做</option><option value="actual">實際做了</option></select></label><label className="field">連結今日待辦<select value={editing.task_id ?? ''} onChange={event => { const id = event.target.value || null; setEditing({ ...editing, task_id: id, title: id ? tasks.find(t => t.id === id)?.title ?? editing.title : editing.title }) }}><option value="">不連結</option>{tasks.map(task => <option key={task.id} value={task.id}>{task.title}</option>)}</select></label></div>
      <label className="field">內容<input maxLength={100} autoFocus value={editing.title} onChange={event => setEditing({ ...editing, title: event.target.value })} placeholder="讀書、運動、休息…"/></label>
      <div className="field-grid"><label className="field">開始<select value={editing.start_hour} onChange={event => setEditing({ ...editing, start_hour: Number(event.target.value) })}>{hours.map(hour => <option key={hour} value={hour}>{label(hour)}{hour >= 24 ? ' 隔天' : ''}</option>)}</select></label><label className="field">結束<select value={editing.end_hour} onChange={event => setEditing({ ...editing, end_hour: Number(event.target.value) })}>{hours.map(hour => <option key={hour + 1} value={hour + 1}>{label(hour + 1)}{hour + 1 >= 24 ? ' 隔天' : ''}</option>)}</select></label></div>
      <label className="field">備註（選填）<textarea maxLength={1000} rows={2} value={editing.notes} onChange={event => setEditing({ ...editing, notes: event.target.value })}/></label>
      {formError && <p className="validation" role="alert">{formError}</p>}
      <div className="modal-actions">{items.some(item => item.id === editing.id) && <button className="secondary delete-entry" type="button" disabled={busy || submitting} onClick={async () => { if (window.confirm('刪除這個時段？') && await onDelete(editing)) setEditing(null) }}><Trash2 size={15}/>刪除</button>}{items.some(item => item.id === editing.id) && <button className="secondary" type="button" disabled={busy || submitting} onClick={async () => { await toggleEntry(editing); setEditing(null) }}>{completed(editing) ? '取消完成' : '標記完成'}</button>}<button className="secondary" type="button" onClick={() => setEditing(null)}>取消</button><button className="primary" disabled={submitting || busy}>{submitting ? '儲存中…' : '儲存'}</button></div>
    </form></div></div>}
  </>
}
