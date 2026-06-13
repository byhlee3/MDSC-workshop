import { useEffect, useRef, useState } from 'react'
import {
  adminApi,
  api,
  type ChatMessage,
  type Debrief,
  type ParticipantState,
  type Results,
  type RunOut,
} from './api'

const PID_KEY = 'ethics_pid'

export default function App() {
  const [isAdmin, setIsAdmin] = useState(window.location.hash === '#admin')
  useEffect(() => {
    const onHash = () => setIsAdmin(window.location.hash === '#admin')
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  return isAdmin ? <AdminApp /> : <StudentApp />
}

// ----------------------------------------------------------------------------
// Student flow
// ----------------------------------------------------------------------------
function StudentApp() {
  const [state, setState] = useState<ParticipantState | null>(null)
  const [error, setError] = useState('')

  // Resume on load if we have a stored participant id.
  useEffect(() => {
    const pid = localStorage.getItem(PID_KEY)
    if (!pid) return
    api.getState(pid).then(setState).catch(() => localStorage.removeItem(PID_KEY))
  }, [])

  const reset = () => {
    localStorage.removeItem(PID_KEY)
    setState(null)
  }

  if (!state)
    return (
      <Join
        onJoined={(s) => {
          localStorage.setItem(PID_KEY, s.participant_id)
          setState(s)
        }}
      />
    )

  const common = { state, setState, setError }
  return (
    <>
      <h1>Clinical Ethics Discussion</h1>
      {error && <p className="error">{error}</p>}
      {state.phase === 'joined' && <Consent {...common} />}
      {state.phase === 'scenario' && <RatePhase phase="pre" {...common} />}
      {state.phase === 'chatting' && <Chat {...common} />}
      {state.phase === 'post' && <RatePhase phase="post" {...common} />}
      {state.phase === 'done' && <DebriefView state={state} onReset={reset} />}
    </>
  )
}

function Join({ onJoined }: { onJoined: (s: ParticipantState) => void }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const submit = async () => {
    try {
      onJoined(await api.join(code.trim().toUpperCase()))
    } catch (e) {
      setError((e as Error).message)
    }
  }
  return (
    <>
      <h1>Clinical Ethics Discussion</h1>
      <div className="card">
        <p>Enter the join code provided by your facilitator.</p>
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="ABC123" />
        {error && <p className="error">{error}</p>}
        <div style={{ marginTop: 12 }}>
          <button onClick={submit} disabled={!code.trim()}>
            Join
          </button>
        </div>
      </div>
    </>
  )
}

type PhaseProps = {
  state: ParticipantState
  setState: (s: ParticipantState) => void
  setError: (e: string) => void
}

function Consent({ state, setState, setError }: PhaseProps) {
  const accept = async () => {
    try {
      setState(await api.consent(state.participant_id))
    } catch (e) {
      setError((e as Error).message)
    }
  }
  return (
    <div className="card">
      <h2>Consent</h2>
      <p>
        In this session you will read a short clinical case, rate how much you agree with the
        action the care team took, discuss the case with an AI, and then rate it again.
      </p>
      <p>
        Your responses are recorded anonymously — we do not collect your name or any
        identifying information. You may stop at any time.
      </p>
      <button onClick={accept}>I understand and agree</button>
    </div>
  )
}

function ScenarioCard({ state }: { state: ParticipantState }) {
  return (
    <div className="card">
      <h2>{state.scenario.title}</h2>
      <div className="scenario">{state.scenario.body}</div>
      <div className="action">
        <strong>Action the care team took:</strong>
        <div className="scenario">{state.scenario.action_taken}</div>
      </div>
    </div>
  )
}

function RatePhase({
  phase,
  state,
  setState,
  setError,
}: PhaseProps & { phase: 'pre' | 'post' }) {
  const [score, setScore] = useState(5)
  const [rationale, setRationale] = useState('')
  const [changeReport, setChangeReport] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true)
    try {
      const next = await api.rate(
        state.participant_id,
        phase,
        score,
        rationale,
        phase === 'post' ? changeReport : undefined,
      )
      setState(next)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <ScenarioCard state={state} />
      <div className="card">
        <h2>{phase === 'pre' ? 'Your initial rating' : 'Your rating after the discussion'}</h2>
        <p>How much do you agree with the action the care team took?</p>
        <div className="row">
          <span className="muted">Strongly disagree</span>
          <input
            type="range"
            min={1}
            max={10}
            value={score}
            onChange={(e) => setScore(Number(e.target.value))}
          />
          <span className="muted">Strongly agree</span>
          <strong style={{ width: 24, textAlign: 'right' }}>{score}</strong>
        </div>
        <p style={{ marginBottom: 4 }}>Briefly, why?</p>
        <textarea value={rationale} onChange={(e) => setRationale(e.target.value)} />
        {phase === 'post' && (
          <>
            <p style={{ marginBottom: 4, marginTop: 12 }}>
              Did the conversation change your mind? How?
            </p>
            <textarea value={changeReport} onChange={(e) => setChangeReport(e.target.value)} />
          </>
        )}
        <div style={{ marginTop: 12 }}>
          <button onClick={submit} disabled={busy || !rationale.trim()}>
            {phase === 'pre' ? 'Continue to discussion' : 'Submit final rating'}
          </button>
        </div>
      </div>
    </>
  )
}

function Chat({ state, setState, setError }: PhaseProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [streaming, setStreaming] = useState('')
  const [busy, setBusy] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const logRef = useRef<HTMLDivElement>(null)

  const startKey = `chat_start_${state.participant_id}`

  // Load history + establish the chat start time.
  useEffect(() => {
    api.getMessages(state.participant_id).then(setMessages).catch(() => {})
    if (!localStorage.getItem(startKey)) {
      localStorage.setItem(startKey, String(Date.now()))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.participant_id])

  // Countdown tick.
  useEffect(() => {
    const start = Number(localStorage.getItem(startKey)) || Date.now()
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    logRef.current?.scrollTo(0, logRef.current.scrollHeight)
  }, [messages, streaming])

  const studentCount = messages.filter((m) => m.role === 'student').length
  const remaining = Math.max(0, state.chat_duration_seconds - elapsed)
  const canContinue =
    elapsed >= state.chat_min_seconds && studentCount >= state.chat_min_student_messages
  const timeUp = remaining === 0

  const send = async () => {
    const content = draft.trim()
    if (!content) return
    setDraft('')
    setBusy(true)
    setMessages((m) => [...m, { role: 'student', content, ordinal: m.length }])
    let acc = ''
    try {
      await api.sendMessage(state.participant_id, content, (delta) => {
        acc += delta
        setStreaming(acc)
      })
      setMessages((m) => [...m, { role: 'ai', content: acc, ordinal: m.length }])
      setStreaming('')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // Advance the UI to the post-rating screen. The server keeps the participant in
  // 'chatting' until the post rating is actually submitted (with its own min-message
  // check), so this is purely a client-side step.
  const finish = () => setState({ ...state, phase: 'post' })

  const mm = String(Math.floor(remaining / 60)).padStart(2, '0')
  const ss = String(remaining % 60).padStart(2, '0')

  return (
    <>
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>Discuss the case</h2>
          <span className="muted">
            Time left {mm}:{ss}
          </span>
        </div>
        <p className="muted">
          Talk through your view. You can continue after {state.chat_min_student_messages}{' '}
          messages and {Math.round(state.chat_min_seconds / 60)} min.
        </p>
        <div
          className="chat-log"
          ref={logRef}
          style={{ maxHeight: 360, overflowY: 'auto' }}
        >
          {messages.map((m, i) => (
            <div key={i} className={`bubble ${m.role}`}>
              {m.content}
            </div>
          ))}
          {streaming && <div className="bubble ai">{streaming}</div>}
          {messages.length === 0 && !streaming && (
            <p className="muted">Send a message to start the discussion.</p>
          )}
        </div>
        <div className="row">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Type your message…"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
          />
          <button onClick={send} disabled={busy || !draft.trim()}>
            Send
          </button>
        </div>
      </div>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button onClick={finish} disabled={!canContinue && !timeUp}>
          Continue to final rating
        </button>
      </div>
    </>
  )
}

function DebriefView({ state, onReset }: { state: ParticipantState; onReset: () => void }) {
  const [debrief, setDebrief] = useState<Debrief | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    api.debrief(state.participant_id).then(setDebrief).catch((e) => setError(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const label: Record<string, string> = {
    pro: 'argue in favour of the action the care team took',
    anti: 'argue against the action the care team took',
    control: 'stay neutral and not push you either way',
  }

  return (
    <div className="card">
      <h2>Thank you — here's what was really going on</h2>
      {error && <p className="error">{error}</p>}
      {debrief && (
        <>
          <p>
            The AI you spoke with was <strong>secretly assigned</strong> a position before
            your conversation. In your case, it was instructed to{' '}
            <strong>{label[debrief.condition]}</strong>. We didn't tell you in advance
            because knowing would have changed how you engaged — that's the whole point of
            the study.
          </p>
          <p>
            Your rating went from <strong>{debrief.pre_score}</strong> before to{' '}
            <strong>{debrief.post_score}</strong> after — a shift of{' '}
            <strong>{debrief.shift > 0 ? `+${debrief.shift}` : debrief.shift}</strong>.
          </p>
          <p className="muted">
            We're studying whether and how AI conversation shifts ethical reasoning. Your
            anonymous responses help answer that.
          </p>
          <button className="secondary" onClick={onReset}>
            Done
          </button>
        </>
      )}
    </div>
  )
}

// ----------------------------------------------------------------------------
// Admin / facilitator
// ----------------------------------------------------------------------------
function AdminApp() {
  const [password, setPassword] = useState(sessionStorage.getItem('admin_pw') || '')
  const [authed, setAuthed] = useState(false)
  const [runs, setRuns] = useState<RunOut[]>([])
  const [results, setResults] = useState<Results | null>(null)
  const [error, setError] = useState('')
  const a = adminApi(password)

  const refresh = async () => {
    try {
      setRuns(await a.listRuns())
      setResults(await a.results())
      setAuthed(true)
      sessionStorage.setItem('admin_pw', password)
    } catch (e) {
      setError((e as Error).message)
      setAuthed(false)
    }
  }

  useEffect(() => {
    if (!authed) return
    const t = setInterval(refresh, 4000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed, password])

  if (!authed) {
    return (
      <div className="card">
        <h2>Facilitator login</h2>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Admin password"
        />
        {error && <p className="error">{error}</p>}
        <div style={{ marginTop: 12 }}>
          <button onClick={refresh}>Enter</button>
        </div>
      </div>
    )
  }

  return (
    <>
      <h1>Facilitator dashboard</h1>
      {error && <p className="error">{error}</p>}
      <CreateRun a={a} onCreated={refresh} />
      <Runs runs={runs} a={a} />
      <ResultsCard results={results} />
      <div className="card">
        <a href={a.exportUrl}>
          <button className="secondary">Download CSV export</button>
        </a>
        <p className="muted">
          CSV download uses the browser session; the full JSON dump is at
          /api/admin/export.json (send the password header).
        </p>
      </div>
    </>
  )
}

function CreateRun({
  a,
  onCreated,
}: {
  a: ReturnType<typeof adminApi>
  onCreated: () => void
}) {
  const [num, setNum] = useState(1)
  const [created, setCreated] = useState<RunOut | null>(null)
  const create = async () => {
    setCreated(await a.createRun(num, ''))
    onCreated()
  }
  return (
    <div className="card">
      <h2>Create a run</h2>
      <div className="row">
        <label>Run #</label>
        <input
          type="number"
          style={{ width: 80 }}
          value={num}
          onChange={(e) => setNum(Number(e.target.value))}
        />
        <button onClick={create}>Create</button>
      </div>
      {created && (
        <p style={{ marginTop: 12 }}>
          Run {created.run_number} created. Join code:{' '}
          <strong style={{ fontSize: '1.3em' }}>{created.join_code}</strong>
        </p>
      )}
    </div>
  )
}

function Runs({ runs, a }: { runs: RunOut[]; a: ReturnType<typeof adminApi> }) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [monitor, setMonitor] = useState<Awaited<ReturnType<typeof a.monitor>>>([])
  useEffect(() => {
    if (!openId) return
    const load = () => a.monitor(openId).then(setMonitor).catch(() => {})
    load()
    const t = setInterval(load, 3000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId])

  return (
    <div className="card">
      <h2>Runs</h2>
      {runs.length === 0 && <p className="muted">No runs yet.</p>}
      {runs.map((r) => (
        <div key={r.id} style={{ marginBottom: 8 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span>
              Run {r.run_number} — code <strong>{r.join_code}</strong>
            </span>
            <button
              className="secondary"
              onClick={() => setOpenId(openId === r.id ? null : r.id)}
            >
              {openId === r.id ? 'Hide' : 'Monitor'}
            </button>
          </div>
          {openId === r.id && (
            <table>
              <thead>
                <tr>
                  <th>Participant</th>
                  <th>Phase</th>
                  <th>Condition</th>
                </tr>
              </thead>
              <tbody>
                {monitor.map((p) => (
                  <tr key={p.participant_id}>
                    <td>{p.participant_id.slice(0, 8)}</td>
                    <td>{p.phase}</td>
                    <td>{p.condition ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
    </div>
  )
}

function ResultsCard({ results }: { results: Results | null }) {
  if (!results) return null
  return (
    <div className="card">
      <h2>Results (pooled across all runs)</h2>
      <p className="muted">
        {results.completed} completed of {results.total_participants} joined.
      </p>
      <table>
        <thead>
          <tr>
            <th>Condition</th>
            <th>n</th>
            <th>Mean pre</th>
            <th>Mean post</th>
            <th>Mean shift</th>
          </tr>
        </thead>
        <tbody>
          {results.by_condition.map((c) => (
            <tr key={c.condition}>
              <td>{c.condition}</td>
              <td>{c.n}</td>
              <td>{c.mean_pre?.toFixed(2) ?? '—'}</td>
              <td>{c.mean_post?.toFixed(2) ?? '—'}</td>
              <td>
                <strong>
                  {c.mean_shift == null
                    ? '—'
                    : c.mean_shift > 0
                      ? `+${c.mean_shift.toFixed(2)}`
                      : c.mean_shift.toFixed(2)}
                </strong>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
