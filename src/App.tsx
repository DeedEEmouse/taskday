import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, CalendarDays, CalendarRange, Check, ChevronRight, CircleHelp, LayoutList, LogOut, Medal, Plus, Settings2, Sparkles, Trash2, X } from 'lucide-react'
import type { User } from '@supabase/supabase-js'
import { dateKey, formatDate, makeTask, parseDate, scoreForDay, seedDemo, shiftDate, type Completion, type Kind, type Mode, type Store, type Task } from './model'
import { supabase } from './supabase'
import Planner, { type ScheduleEntry } from './Planner'

type View = 'today' | 'manage' | 'history' | 'planner'
const today = () => dateKey(new Date())
const weekdays = ['日', '一', '二', '三', '四', '五', '六']
const modeLabel: Record<Mode, string> = { manual: '自訂比例', weighted: '依權重分配', equal: '平均分配' }
const demoKey = 'taskday-demo-v1'

function loadDemo(): Store {
  try {
    const saved = localStorage.getItem(demoKey)
    if (saved) return JSON.parse(saved) as Store
  } catch { /* private browsing or corrupt local state */ }
  return seedDemo(today())
}

function scheduleLabel(t: Task) {
  if (t.kind === 'once') return `一次性 · ${t.anchor_date}`
  if (t.kind === 'daily') return '每天'
  if (t.kind === 'interval') return `每 ${Number(t.interval_days ?? 1) + 1} 天 · 從 ${t.anchor_date} 起`
  if (t.kind === 'weekly') return `每週${t.weekdays.map(w => weekdays[w]).join('、')}`
  if (t.kind === 'monthly') return `每月 ${t.day_of_month} 日`
  return `每年 ${t.month_of_year} 月 ${t.day_of_month} 日`
}

function makeNext(previous: Store, changed: Task[], removed: string[] = []): Store {
  let tasks = previous.tasks.map(t => changed.find(c => c.id === t.id) ?? t).concat(changed.filter(c => !previous.tasks.some(t => t.id === c.id)))
  tasks = tasks.map(t => removed.includes(t.id) ? { ...t, archived_on: today() } : t)
  return { ...previous, tasks }
}

function Auth({ onDemo }: { onDemo: () => void }) {
  const [register, setRegister] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!supabase) return
    setBusy(true); setMessage('')
    const result = register
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (result.error) setMessage(result.error.message)
    else if (register && !result.data.session) setMessage('註冊信已寄出，請先至信箱驗證後再登入。')
  }
  return <div className="auth-shell"><div className="auth-brand"><div className="brand-icon"><Check size={23}/></div><span>日日進度</span></div>
    <div className="auth-card"><span className="eyebrow">YOUR SPACE</span><h1>{register ? '建立你的帳號' : '歡迎回來'}</h1><p>把想做的事排進日常，完成後留下清楚的紀錄。</p>
      <form onSubmit={submit}><label>電子郵件<input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" /></label>
      <label>密碼<input type="password" required minLength={6} autoComplete={register ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="至少 6 個字元" /></label>
      {message && <div className="form-note" role="status">{message}</div>}
      <button className="primary full" disabled={busy}>{busy ? '處理中…' : register ? '建立帳號' : '登入'}</button></form>
      <button className="text-button" onClick={() => { setRegister(!register); setMessage('') }}>{register ? '已有帳號？登入' : '還沒有帳號？註冊'}</button>
      <div className="auth-divider">或</div><button className="secondary full" onClick={onDemo}>先試用示範版</button><small>示範資料只保存在這個瀏覽器。</small>
    </div></div>
}

function TaskForm({ initial, copying, onClose, onSave }: { initial: Task | null; copying: boolean; onClose: () => void; onSave: (task: Task) => Promise<void> }) {
  const [task, setTask] = useState<Task>(() => initial ?? makeTask('', 'once', today(), '', 0))
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')
  const set = (values: Partial<Task>) => setTask(t => ({ ...t, ...values }))
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!task.title.trim() || (task.kind === 'weekly' && !task.weekdays.length)) return
    setBusy(true)
    try { await onSave({ ...task, title: task.title.trim() }); onClose() }
    catch (error) { setFormError(error instanceof Error ? error.message : '儲存失敗，請再試一次。') }
    finally { setBusy(false) }
  }
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}><div className="modal" role="dialog" aria-modal="true" aria-label={copying ? '複製任務' : initial ? '編輯任務' : '新增任務'}>
    <div className="modal-head"><div><span className="eyebrow">TASK DETAILS</span><h2>{copying ? '複製到其他日期' : initial ? '編輯任務' : '新增任務'}</h2></div><button className="icon-button" aria-label="關閉" onClick={onClose}><X size={20}/></button></div>
    <form onSubmit={submit}><label className="field">任務名稱<input value={task.title} required maxLength={80} autoFocus onChange={e => set({ title: e.target.value })} placeholder="例如：讀書 30 分鐘" /></label>
    <label className="field">任務類型<select value={task.kind} onChange={e => { const kind = e.target.value as Kind; set({ kind, interval_days: kind === 'interval' ? task.interval_days ?? 1 : null, anchor_date: kind === 'interval' || kind === 'once' ? task.anchor_date ?? today() : null, weekdays: kind === 'weekly' ? task.weekdays.length ? task.weekdays : [new Date().getDay()] : [], day_of_month: kind === 'monthly' || kind === 'yearly' ? task.day_of_month ?? new Date().getDate() : null, month_of_year: kind === 'yearly' ? task.month_of_year ?? new Date().getMonth() + 1 : null }) }}><option value="once">不重複（一次性）</option><option value="daily">每天</option><option value="interval">每隔幾天</option><option value="weekly">每週指定日期</option><option value="monthly">每月指定日期</option><option value="yearly">每年指定日期</option></select></label>
    {task.kind === 'once' && <label className="field">預定日期<input type="date" required value={task.anchor_date ?? today()} onChange={e => set({ anchor_date: e.target.value })}/></label>}
    {task.kind === 'interval' && <div className="field-grid"><label className="field">間隔天數（隔 n 天）<input type="number" min="1" max="365" required value={task.interval_days ?? 1} onChange={e => set({ interval_days: Number(e.target.value) })} /></label><label className="field">首次執行日<input type="date" required value={task.anchor_date ?? today()} onChange={e => set({ anchor_date: e.target.value })} /></label></div>}
    {task.kind === 'weekly' && <div className="field"><span>每週哪幾天</span><div className="weekday-picker">{weekdays.map((name, i) => <button type="button" key={i} aria-pressed={task.weekdays.includes(i)} onClick={() => set({ weekdays: task.weekdays.includes(i) ? task.weekdays.filter(x => x !== i) : [...task.weekdays, i].sort() })}>{name}</button>)}</div><small>可選多天；每個排定日與其他任務一起分配 100 分。</small></div>}
    {(task.kind === 'monthly' || task.kind === 'yearly') && <div className="field-grid">{task.kind === 'yearly' && <label className="field">月份<input type="number" min="1" max="12" required value={task.month_of_year ?? 1} onChange={e => set({ month_of_year: Number(e.target.value) })}/></label>}<label className="field">日期<input type="number" min="1" max="31" required value={task.day_of_month ?? 1} onChange={e => set({ day_of_month: Number(e.target.value) })}/></label></div>}
    <p className="helper-box">每一天出現的所有任務合計 100 分。可到「任務設定」調整平均、權重或自訂比例；沒有該日期的月份會略過。</p>
    {formError && <p className="validation" role="alert">{formError}</p>}
    <div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>取消</button><button className="primary" disabled={busy || !task.title.trim() || task.kind === 'weekly' && !task.weekdays.length}>{busy ? '儲存中…' : '儲存任務'}</button></div></form>
  </div></div>
}

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [demo, setDemo] = useState(!supabase)
  const [authLoading, setAuthLoading] = useState(!!supabase)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [store, setStore] = useState<Store>(() => loadDemo())
  const [role, setRole] = useState<'user' | 'developer'>('user')
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([])
  const [selected, setSelected] = useState(today())
  const [view, setView] = useState<View>('today')
  const [editing, setEditing] = useState<Task | null | 'new'>(null)
  const [copying, setCopying] = useState(false)
  const [draftPoints, setDraftPoints] = useState<Record<string, number>>({})
  const [draftWeights, setDraftWeights] = useState<Record<string, number>>({})

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getUser().then(({ data }) => { setUser(data.user); setAuthLoading(false) })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => { setUser(session?.user ?? null); setAuthLoading(false) })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (demo) { setStore(loadDemo()); setRole('user'); setSchedule([]); return }
    if (!user || !supabase) { setRole('user'); setSchedule([]); return }
    const client = supabase
    let canceled = false
    setRole('user')
    setLoading(true)
    Promise.all([
      client.from('tasks').select('*').eq('user_id', user.id).order('sort_order'),
      client.from('completions').select('*').eq('user_id', user.id).order('completed_on', { ascending: false }).limit(2000),
      client.from('settings').select('allocation_mode').eq('user_id', user.id).maybeSingle(),
      client.from('user_roles').select('role').eq('user_id', user.id).maybeSingle(),
    ]).then(async ([tasks, completions, settings, userRole]) => {
      if (canceled) return
      const issue = tasks.error ?? completions.error ?? settings.error
      if (issue) setError(`資料載入失敗：${issue.message}。請確認已執行資料庫設定檔。`)
      else {
        setStore({ tasks: tasks.data as Task[], completions: completions.data as Completion[], mode: (settings.data?.allocation_mode ?? 'equal') as Mode })
        if (userRole.error) setError(`Beta 權限載入失敗：${userRole.error.message}。請執行 beta_upgrade.sql。`)
        else {
          const nextRole = userRole.data?.role === 'developer' ? 'developer' : 'user'
          setRole(nextRole)
          if (nextRole === 'developer') {
            const result = await client.from('schedule_entries').select('*').eq('user_id', user.id).order('day').limit(2000)
            if (canceled) return
            if (result.error) setError(`行程載入失敗：${result.error.message}`)
            else { setSchedule(result.data as ScheduleEntry[]); setError('') }
          } else { setSchedule([]); setError('') }
        }
      }
      setLoading(false)
    })
    return () => { canceled = true }
  }, [demo, user])

  useEffect(() => { if (role !== 'developer' && view === 'planner') setView('today') }, [role, view])

  async function saveSchedule(entry: ScheduleEntry) {
    if (busy || !supabase || !user || role !== 'developer') return false
    setBusy(true); setError('')
    const { data, error: problem } = await supabase.from('schedule_entries').upsert({ ...entry, user_id: user.id }).select().single()
    setBusy(false)
    if (problem) { setError(`行程儲存失敗：${problem.message}`); return false }
    setSchedule(items => [...items.filter(item => item.id !== data.id), data as ScheduleEntry])
    return true
  }

  async function deleteSchedule(entry: ScheduleEntry) {
    if (busy || !supabase || !user || role !== 'developer') return false
    setBusy(true); setError('')
    const { error: problem } = await supabase.from('schedule_entries').delete().eq('id', entry.id).eq('user_id', user.id)
    setBusy(false)
    if (problem) { setError(`行程刪除失敗：${problem.message}`); return false }
    setSchedule(items => items.filter(item => item.id !== entry.id))
    return true
  }

  useEffect(() => {
    setDraftPoints(Object.fromEntries(store.tasks.map(t => [t.id, t.points])))
    setDraftWeights(Object.fromEntries(store.tasks.map(t => [t.id, t.weight])))
  }, [store.tasks])

  async function commit(next: Store) {
    if (busy) return
    setBusy(true); setError('')
    try {
      if (demo) localStorage.setItem(demoKey, JSON.stringify(next))
      else if (supabase && user) {
        const changed = next.tasks.filter(t => JSON.stringify(t) !== JSON.stringify(store.tasks.find(old => old.id === t.id)))
        if (changed.length) { const { error } = await supabase.from('tasks').upsert(changed); if (error) throw error }
        const added = next.completions.filter(c => !store.completions.some(old => old.id === c.id))
        const removed = store.completions.filter(c => !next.completions.some(now => now.id === c.id))
        const modified = next.completions.filter(c => store.completions.some(old => old.id === c.id && old.awarded_points !== c.awarded_points))
        if (added.length || modified.length) { const { error } = await supabase.from('completions').upsert([...added, ...modified]); if (error) throw error }
        if (removed.length) { const { error } = await supabase.from('completions').delete().in('id', removed.map(c => c.id)).eq('user_id', user.id); if (error) throw error }
        if (next.mode !== store.mode) { const { error } = await supabase.from('settings').upsert({ user_id: user.id, allocation_mode: next.mode }); if (error) throw error }
      }
      setStore(next)
      return true
    } catch (e) { setError(`儲存失敗：${e instanceof Error ? e.message : '請稍後再試'}`); return false }
    finally { setBusy(false) }
  }

  const todayScore = useMemo(() => scoreForDay(store, selected), [store, selected])
  const repeats = store.tasks.filter(t => t.kind !== 'once' && !t.archived_on)
  const once = store.tasks.filter(t => t.kind === 'once' && !t.archived_on)
  const sorted = (tasks: Task[]) => [...tasks].sort((a, b) => a.sort_order - b.sort_order)

  async function saveTask(value: Task) {
    if (busy) return
    const isNew = editing === 'new' || copying
    const final = { ...value, id: copying ? crypto.randomUUID() : value.id, user_id: demo ? 'demo' : user!.id, sort_order: isNew ? store.tasks.length : value.sort_order, created_on: isNew && value.kind === 'once' && value.anchor_date && value.anchor_date < today() ? value.anchor_date : isNew ? today() : value.created_on }
    const next = makeNext(store, [final])
    if (!await commit(next)) throw new Error('儲存失敗，請再試一次。')
  }

  async function archive(t: Task) {
    if (!window.confirm(`封存「${t.title}」？過去的完成紀錄會保留。`)) return
    await commit(makeNext(store, [], [t.id]))
  }

  async function toggle(t: Task) {
    if (selected > today() || busy) return
    const old = store.completions.find(c => c.task_id === t.id && c.occurrence_key === selected)
    const completions = old ? store.completions.filter(c => c.id !== old.id) : [...store.completions, {
      id: crypto.randomUUID(), user_id: demo ? 'demo' : user!.id, task_id: t.id,
      occurrence_key: selected, completed_on: selected, awarded_points: todayScore.allocation.get(t.id) ?? 0,
    }]
    await commit({ ...store, completions })
  }

  function changeMode(mode: Mode) {
    if (mode === store.mode) return
    void commit({ ...store, mode })
  }

  function saveAllocation() {
    const tasks = store.tasks.map(t => ({ ...t, points: draftPoints[t.id] ?? t.points, weight: draftWeights[t.id] ?? t.weight }))
    void commit({ ...store, tasks })
  }

  const allocationDirty = todayScore.due.some(t => t.points !== draftPoints[t.id] || t.weight !== draftWeights[t.id])
  const recent = Array.from({ length: 7 }, (_, i) => shiftDate(today(), i - 6))

  if (authLoading) return <div className="page-loader">正在載入…</div>
  if (!demo && !user) return <Auth onDemo={() => setDemo(true)} />

  return <div className="app-shell">
    <aside className="sidebar"><div className="brand"><div className="brand-icon"><Check size={21}/></div><span>日日進度</span></div>
      <div className="nav-caption">工作區</div><nav aria-label="主選單">
        <button className={view === 'today' ? 'nav-item active' : 'nav-item'} onClick={() => setView('today')}><LayoutList size={19}/> 今日待辦 <ChevronRight size={16}/></button>
        <button className={view === 'manage' ? 'nav-item active' : 'nav-item'} onClick={() => setView('manage')}><Settings2 size={19}/> 任務設定 <ChevronRight size={16}/></button>
        <button className={view === 'history' ? 'nav-item active' : 'nav-item'} onClick={() => setView('history')}><CalendarDays size={19}/> 積分紀錄 <ChevronRight size={16}/></button>
        {role === 'developer' && !demo && <button className={view === 'planner' ? 'nav-item active' : 'nav-item'} onClick={() => setView('planner')}><CalendarRange size={19}/> 一日行程表 <ChevronRight size={16}/></button>}
      </nav>
      <div className="sidebar-bottom"><div className="rule-card"><Sparkles size={19}/><strong>達成目標，額外 +20</strong><span>5 項以下全部完成；6–9 項可少 1 項；10 項以上可少 2 項。</span></div>
        <div className="account"><div className="avatar">{demo ? '試' : (user?.email?.[0] ?? '我').toUpperCase()}</div><div><strong>{demo ? '示範模式' : user?.email}</strong><span>{demo ? '資料儲存在這個瀏覽器' : role === 'developer' ? '開發者 · Beta 已開啟' : '資料已連結帳號'}</span></div>
        </div>
      </div>
    </aside>
    <main className="main">
      <header className="topbar"><div className="mobile-brand"><div className="brand-icon"><Check size={17}/></div> 日日進度</div><span className="topbar-label">{view === 'today' ? '今日總覽' : view === 'manage' ? '任務與分數' : view === 'planner' ? '一日行程表 · Beta' : '積分紀錄'}</span>{!demo && supabase ? <button className="topbar-right account-action" onClick={() => void supabase?.auth.signOut()}><LogOut size={15}/>登出</button> : demo && supabase ? <button className="topbar-right account-action" onClick={() => setDemo(false)}>登入</button> : <span className="topbar-right">示範模式</span>}</header>
      <div className="content">{error && <div className="error-banner" role="alert">{error}<button aria-label="關閉錯誤訊息" onClick={() => setError('')}><X size={16}/></button></div>}
      {loading ? <div className="loading-state">正在載入你的任務…</div> : view === 'planner' && role === 'developer' && user && !demo ? <Planner day={selected} onDayChange={setSelected} entries={schedule} userId={user.id} busy={busy} tasks={todayScore.due} doneIds={todayScore.doneIds} onToggleTask={toggle} onSave={saveSchedule} onDelete={deleteSchedule}/> : view === 'today' ? <>
        <div className="page-heading"><div><span className="eyebrow">YOUR DAILY PLAN</span><h1>今天，從這裡開始<span className="heading-dot">.</span></h1><p>把每件事做好，積分會替你記下來。</p></div><button className="primary add-task" aria-label="新增任務" onClick={() => setEditing('new')}><Plus size={18}/><span className="add-task-label">新增任務</span></button></div>
        <div className="date-controls"><div className="date-current"><CalendarDays size={18}/><strong>{formatDate(selected)}</strong>{selected === today() && <span className="today-pill">今天</span>}</div><div className="date-buttons"><button aria-label="前一天" onClick={() => setSelected(shiftDate(selected, -1))}><ArrowLeft size={18}/></button><button className="today-button" onClick={() => setSelected(today())}>回到今天</button><button aria-label="後一天" disabled={selected >= today()} onClick={() => setSelected(shiftDate(selected, 1))}><ArrowRight size={18}/></button></div></div>
        <div className="overview"><div className="overview-main"><div className="ring" style={{ '--progress': `${todayScore.due.length ? Math.round(100 * todayScore.doneCount / todayScore.due.length) : 0}%` } as React.CSSProperties}><div><strong>{todayScore.due.length ? Math.round(100 * todayScore.doneCount / todayScore.due.length) : 0}%</strong><span>今日完成度</span></div></div><div className="overview-copy"><span className="eyebrow">DAILY PROGRESS</span><h2>{todayScore.bonus ? '今天達成額外獎勵！' : '繼續累積今天的進度'}</h2><p>已完成 <strong>{todayScore.doneCount}</strong> / {todayScore.due.length} 項任務</p><div className="progress-track"><div style={{ width: `${todayScore.due.length ? 100 * todayScore.doneCount / todayScore.due.length : 0}%` }}/></div></div></div><div className="overview-score"><Medal size={22}/><span>當日積分</span><div><strong>{todayScore.points}</strong><small>分</small></div><p>今日全部任務合計 100 分<br/>{todayScore.due.length >= 10 ? '少做 2 項內' : todayScore.due.length >= 6 ? '少做 1 項內' : '全部完成'}額外 +20 分</p></div></div>
        <div className="section-title"><div><h2>今日待辦</h2><p>完成一項，拿到對應積分。行程表連結的待辦會同步更新。</p></div><span>{todayScore.due.filter(t => todayScore.doneIds.has(t.id)).length} / {todayScore.due.length} 已完成</span></div>
        <div className="todo-columns daily-todos"><section className="todo-group"><h3>待完成 <span>{todayScore.due.filter(t => !todayScore.doneIds.has(t.id)).length}</span></h3>{sorted(todayScore.due.filter(t => !todayScore.doneIds.has(t.id))).map(t => <button className="todo-item" key={t.id} disabled={selected > today() || busy} onClick={() => void toggle(t)}><span className="checkbox"/><span className="task-name">{t.title}<small>{t.kind === 'daily' ? '每日任務' : scheduleLabel(t)}</small></span><span className="point-pill">+{todayScore.allocation.get(t.id) ?? 0} 分</span></button>)}{!todayScore.due.some(t => !todayScore.doneIds.has(t.id)) && <p className="todo-empty">今天的待辦都完成了。</p>}</section><section className="todo-group done"><h3>已完成 <span>{todayScore.due.filter(t => todayScore.doneIds.has(t.id)).length}</span></h3>{sorted(todayScore.due.filter(t => todayScore.doneIds.has(t.id))).map(t => <button className="todo-item" key={t.id} disabled={selected > today() || busy} onClick={() => void toggle(t)}><span className="checkbox"><Check size={15}/></span><span className="task-name">{t.title}<small>{t.kind === 'daily' ? '每日任務' : scheduleLabel(t)}</small></span></button>)}{!todayScore.due.some(t => todayScore.doneIds.has(t.id)) && <p className="todo-empty">完成後會移到這裡。</p>}</section></div>
        {!todayScore.due.length && <div className="empty-state">這一天還沒有任務。<button onClick={() => setEditing('new')}>新增第一項任務</button></div>}
        {todayScore.bonus > 0 && <div className="bonus-banner"><Sparkles size={20}/><strong>今日達標獎勵</strong><span>+20 分已加入今天的積分</span></div>}
      </> : view === 'manage' ? <>
        <div className="page-heading"><div><span className="eyebrow">SET YOUR RHYTHM</span><h1>任務設定<span className="heading-dot">.</span></h1><p>決定每天做什麼，以及 100 分如何分配。</p></div><button className="primary add-task" aria-label="新增任務" onClick={() => setEditing('new')}><Plus size={18}/><span className="add-task-label">新增任務</span></button></div>
        <section className="panel allocation"><div className="panel-heading"><div><span className="eyebrow">TODAY'S POINTS</span><h2>當日積分分配</h2><p>所選日期出現的全部任務合計 100 分，沒有任務則為 0 分。</p></div><div className="allocation-total"><strong>{todayScore.due.length ? 100 : 0}</strong><span>/ 100 分</span></div></div>
          <div className="date-controls allocation-date"><div className="date-current"><CalendarDays size={16}/><strong>{formatDate(selected)}</strong></div><div className="date-buttons"><button aria-label="前一天" onClick={() => setSelected(shiftDate(selected, -1))}><ArrowLeft size={17}/></button><button className="today-button" onClick={() => setSelected(today())}>今天</button><button aria-label="後一天" onClick={() => setSelected(shiftDate(selected, 1))}><ArrowRight size={17}/></button></div></div>
          <div className="mode-tabs" role="group" aria-label="積分分配方式">{(['equal', 'weighted', 'manual'] as Mode[]).map(mode => <button key={mode} className={store.mode === mode ? 'selected' : ''} disabled={busy} onClick={() => changeMode(mode)}>{modeLabel[mode]}</button>)}</div>
          <p className="mode-description">{store.mode === 'equal' ? '當天所有任務平均分配 100 分。' : store.mode === 'weighted' ? '依任務權重分配；權重會套用到它出現的每一天。' : '自訂各任務的相對比例；某天出現的任務數不同，實際分數會自動換算。'}</p>
          <div className="allocation-list">{sorted(todayScore.due).map(t => <div className="allocation-row" key={t.id}><span>{t.title}<small>{scheduleLabel(t)}</small></span>{store.mode === 'manual' ? <label>比例 <input aria-label={`${t.title}的比例`} type="number" min="1" max="100" value={draftPoints[t.id] ?? t.points} onChange={e => setDraftPoints(p => ({ ...p, [t.id]: Number(e.target.value) }))}/></label> : store.mode === 'weighted' ? <label>權重 <input aria-label={`${t.title}的權重`} type="number" min="1" max="100" value={draftWeights[t.id] ?? t.weight} onChange={e => setDraftWeights(p => ({ ...p, [t.id]: Number(e.target.value) }))}/></label> : null}<strong>{todayScore.allocation.get(t.id) ?? 0} 分</strong></div>)}{!todayScore.due.length && <p className="todo-empty">這一天沒有排定任務。</p>}</div>
          {store.mode !== 'equal' && <button className="primary save-allocation" disabled={busy || !allocationDirty || todayScore.due.some(t => store.mode === 'manual' ? !Number.isInteger(draftPoints[t.id]) || draftPoints[t.id] < 1 || draftPoints[t.id] > 100 : !Number.isInteger(draftWeights[t.id]) || draftWeights[t.id] < 1 || draftWeights[t.id] > 100)} onClick={saveAllocation}>儲存比例</button>}
        </section>
        <div className="section-title"><div><h2>不重複任務</h2><p>指定一天執行，完成後不再出現。</p></div><span>{once.length} 項</span></div>
        <div className="manage-list">{sorted(once).map(t => <div className="manage-row" key={t.id}><div className="list-glyph"><Check size={17}/></div><div className="manage-details"><strong>{t.title}</strong><span className="kind-badge">{scheduleLabel(t)}</span></div><div className="manage-actions"><button onClick={() => setEditing(t)}>編輯</button><button aria-label={`封存${t.title}`} title="封存任務" onClick={() => archive(t)}><Trash2 size={17}/></button></div></div>)}{!once.length && <div className="empty-state subtle">還沒有不重複任務。</div>}</div>
        <div className="section-title repeat-heading"><div><h2>重複任務</h2><p>依設定的週期出現；每天與其他任務一起分配 100 分。</p></div><span>{repeats.length} 項</span></div>
        <div className="manage-list">{sorted(repeats).map(t => <div className="manage-row" key={t.id}><div className="list-glyph alt"><CalendarDays size={17}/></div><div className="manage-details"><strong>{t.title}</strong><span className="kind-badge">{scheduleLabel(t)}</span></div><div className="manage-actions"><button onClick={() => { setCopying(true); setEditing(t) }}>複製</button><button onClick={() => setEditing(t)}>編輯</button><button aria-label={`封存${t.title}`} title="封存任務" onClick={() => archive(t)}><Trash2 size={17}/></button></div></div>)}{!repeats.length && <div className="empty-state subtle">還沒有重複任務。</div>}</div>
        <div className="hint"><CircleHelp size={18}/><span>間隔 n 天代表每 n+1 天執行一次。每月 29～31 日在缺少該日期的月份會略過。</span></div>
      </> : <>
        <div className="page-heading"><div><span className="eyebrow">YOUR RECORD</span><h1>積分紀錄<span className="heading-dot">.</span></h1><p>看看最近七天，每一天累積了多少。</p></div></div>
        <div className="history-summary"><Medal size={24}/><div><span>最近七天總積分</span><strong>{recent.reduce((sum, key) => sum + scoreForDay(store, key).points, 0)} <small>分</small></strong></div></div>
        <section className="panel history-panel"><h2>最近七天</h2><div className="chart">{recent.map(key => { const score = scoreForDay(store, key); return <button key={key} className={key === selected ? 'chart-day selected' : 'chart-day'} onClick={() => { setSelected(key); setView('today') }} title={`${formatDate(key)}：${score.points} 分`}><span>{score.points}</span><div className="chart-track"><div style={{ height: `${Math.max(3, Math.min(100, score.points / 160 * 100))}%` }}/></div><small>{parseDate(key).getDate()} 日</small></button> })}</div><p>點選日期，可查看當天完成的任務。</p></section>
        <div className="section-title"><div><h2>每日明細</h2></div></div><div className="history-list">{[...recent].reverse().map(key => { const s = scoreForDay(store, key); return <button key={key} onClick={() => { setSelected(key); setView('today') }}><span>{formatDate(key)}<small>已完成 {s.doneCount}/{s.due.length} 項{s.bonus ? ' · 含達標獎勵' : ''}</small></span><strong>{s.points} 分</strong><ChevronRight size={18}/></button> })}</div>
      </>}
      </div>
      <nav className="mobile-nav" aria-label="手機選單"><button className={view === 'today' ? 'active' : ''} onClick={() => setView('today')}><LayoutList size={20}/>任務</button><button className={view === 'manage' ? 'active' : ''} onClick={() => setView('manage')}><Settings2 size={20}/>設定</button><button className={view === 'history' ? 'active' : ''} onClick={() => setView('history')}><CalendarDays size={20}/>紀錄</button>{role === 'developer' && !demo && <button className={view === 'planner' ? 'active' : ''} onClick={() => setView('planner')}><CalendarRange size={20}/>行程</button>}</nav>
    </main>
    {editing && <TaskForm initial={editing === 'new' ? null : editing} copying={copying} onClose={() => { setEditing(null); setCopying(false) }} onSave={saveTask} />}
  </div>
}
