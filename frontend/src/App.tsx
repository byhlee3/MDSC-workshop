import { useEffect, useRef, useState } from 'react'
import {
  adminApi,
  api,
  type ChatMessage,
  type ParticipantState,
  type Results,
  type RunOut,
} from './api'

const PID_KEY = 'ethics_pid'

function agreeWord(n: number): string {
  if (n <= 2) return 'strongly disagree'
  if (n <= 4) return 'disagree'
  if (n <= 6) return 'undecided'
  if (n <= 8) return 'agree'
  return 'strongly agree'
}

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
  // `post` is a client-only transient (chat finished, post-rating not yet sent);
  // the server jumps straight from `chatting` to `done` on the final verdict.
  return (
    <>
      <div className="wordmark">An Ethics Adventure</div>
      {error && <p className="error">! {error}</p>}
      {state.phase === 'joined' && <Consent {...common} />}
      {state.phase === 'scenario' && <RatePhase phase="pre" {...common} />}
      {state.phase === 'chatting' && <Chat {...common} />}
      {state.phase === 'post' && <RatePhase phase="post" {...common} />}
      {state.phase === 'done' && <Submitted onReset={reset} />}
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
      <div className="wordmark">An Ethics Adventure</div>
      <div className="card">
        <div className="eyebrow">Begin</div>
        <h2>Enter the case</h2>
        <p>
          You are about to weigh a difficult clinical decision, talk it over, and weigh it
          once more. Enter the code your facilitator gave you to begin.
        </p>
        <input
          className="join-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="ABC123"
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        {error && <p className="error">! {error}</p>}
        <div className="actions" style={{ marginTop: 18 }}>
          <button onClick={submit} disabled={!code.trim()}>
            Begin
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
      <div className="eyebrow">Before you begin</div>
      <h2>A few words first</h2>
      <p>
        In this session you will read a short clinical case, rate how much you agree with
        the action the care team took, discuss the case with an AI, and then rate it again.
      </p>
      <p>
        Your responses are recorded <strong>anonymously</strong> — we collect no name or
        identifying information. You may stop at any time.
      </p>
      <div className="actions">
        <button onClick={accept}>I understand — continue</button>
      </div>
    </div>
  )
}

function ScenarioCard({ state }: { state: ParticipantState }) {
  return (
    <div className="card">
      <div className="eyebrow">The Case</div>
      <h2>{state.scenario.title}</h2>
      <div className="scenario">{state.scenario.body}</div>
      <div className="action">
        <strong>The action the care team took</strong>
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
        <div className="eyebrow">{phase === 'pre' ? 'Your verdict' : 'Your verdict, revisited'}</div>
        <h2>{phase === 'pre' ? 'Where do you stand?' : 'Where do you stand now?'}</h2>
        <p>How much do you agree with the action the care team took?</p>

        <div className="scale">
          <div className="scale-value">
            {score}
            <small>{agreeWord(score)}</small>
          </div>
          <div className="scale-labels">
            <span>Strongly disagree</span>
            <span>Strongly agree</span>
          </div>
          <input
            type="range"
            min={1}
            max={10}
            value={score}
            onChange={(e) => setScore(Number(e.target.value))}
          />
        </div>

        <div className="field">
          <label>Briefly — why?</label>
          <textarea value={rationale} onChange={(e) => setRationale(e.target.value)} />
        </div>

        {phase === 'post' && (
          <div className="field">
            <label>Did the conversation change your mind? How?</label>
            <textarea
              value={changeReport}
              onChange={(e) => setChangeReport(e.target.value)}
            />
          </div>
        )}

        <div className="actions" style={{ marginTop: 18 }}>
          <button onClick={submit} disabled={busy || !rationale.trim()}>
            {phase === 'pre' ? 'Continue to the discussion' : 'Submit final verdict'}
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

  useEffect(() => {
    api.getMessages(state.participant_id).then(setMessages).catch(() => {})
    if (!localStorage.getItem(startKey)) {
      localStorage.setItem(startKey, String(Date.now()))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.participant_id])

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

  const finish = () => setState({ ...state, phase: 'post' })

  const mm = String(Math.floor(remaining / 60)).padStart(2, '0')
  const ss = String(remaining % 60).padStart(2, '0')

  return (
    <>
      <div className="card">
        <div className="eyebrow">The Discussion</div>
        <div className="row spread">
          <h2 style={{ margin: 0 }}>Talk it over</h2>
          <span className={`timer${remaining < 60 ? ' urgent' : ''}`}>
            {mm}:{ss}
          </span>
        </div>
        <p className="muted">
          Think aloud and push back. You may continue after{' '}
          {state.chat_min_student_messages} messages and{' '}
          {Math.round(state.chat_min_seconds / 60)} min.
        </p>

        <div className="chat-log" ref={logRef}>
          {messages.map((m, i) => (
            <div key={i} className={`turn ${m.role}`}>
              <div className="turn-label">{m.role === 'student' ? 'You' : 'The Voice'}</div>
              <div className="turn-body">{m.content}</div>
            </div>
          ))}
          {streaming && (
            <div className="turn ai">
              <div className="turn-label">The Voice</div>
              <div className="turn-body cursor">{streaming}</div>
            </div>
          )}
          {messages.length === 0 && !streaming && (
            <p className="muted">— Begin the discussion below. —</p>
          )}
        </div>

        <div className="chat-input">
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

      <div className="actions">
        <button className="secondary" onClick={finish} disabled={!canContinue && !timeUp}>
          Continue to your final verdict
        </button>
      </div>
    </>
  )
}

function Submitted({ onReset }: { onReset: () => void }) {
  return (
    <div className="card">
      <div className="eyebrow">Submitted</div>
      <h2>Thank you for taking part</h2>
      <p>
        Your responses have been recorded. Please set your device down — we'll discuss the
        case together as a group shortly.
      </p>
      <div className="actions">
        <button className="secondary" onClick={onReset}>
          Close
        </button>
      </div>
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
      <>
        <div className="wordmark">Facilitator's Desk</div>
        <div className="card">
          <div className="eyebrow">Restricted</div>
          <h2>Facilitator login</h2>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Admin password"
            onKeyDown={(e) => e.key === 'Enter' && refresh()}
          />
          {error && <p className="error">! {error}</p>}
          <div className="actions" style={{ marginTop: 16 }}>
            <button onClick={refresh}>Enter</button>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="wordmark">Facilitator's Desk</div>
      {error && <p className="error">! {error}</p>}
      <CreateRun a={a} onCreated={refresh} />
      <Runs runs={runs} a={a} />
      <ResultsCard results={results} />
      <div className="card">
        <div className="eyebrow">Data</div>
        <a href={a.exportUrl}>
          <button className="secondary">Download CSV export</button>
        </a>
        <p className="muted" style={{ marginTop: 12 }}>
          The full JSON dump is at /api/admin/export.json (send the password header).
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
      <div className="eyebrow">New session</div>
      <h2>Create a run</h2>
      <div className="row">
        <label>Run №</label>
        <input
          type="number"
          style={{ width: 90 }}
          value={num}
          onChange={(e) => setNum(Number(e.target.value))}
        />
        <button onClick={create}>Create</button>
      </div>
      {created && (
        <p style={{ marginTop: 16 }}>
          Run {created.run_number} created. Join code:{' '}
          <span className="join-code" style={{ display: 'inline-block' }}>
            {created.join_code}
          </span>
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
      <div className="eyebrow">Runs</div>
      {runs.length === 0 && <p className="muted">No runs yet.</p>}
      {runs.map((r) => (
        <div key={r.id} style={{ marginBottom: 12 }}>
          <div className="row spread">
            <span>
              Run {r.run_number} — code{' '}
              <span className="join-code" style={{ display: 'inline-block', fontSize: '1rem' }}>
                {r.join_code}
              </span>
            </span>
            <button
              className="secondary"
              onClick={() => setOpenId(openId === r.id ? null : r.id)}
            >
              {openId === r.id ? 'Hide' : 'Monitor'}
            </button>
          </div>
          {openId === r.id && (
            <table style={{ marginTop: 10 }}>
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
      <div className="eyebrow">Results — pooled across all runs</div>
      <h2>The shift</h2>
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
              <td className={c.mean_shift && c.mean_shift > 0 ? 'shift-pos' : undefined}>
                {c.mean_shift == null
                  ? '—'
                  : c.mean_shift > 0
                    ? `+${c.mean_shift.toFixed(2)}`
                    : c.mean_shift.toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
