import { useEffect, useRef, useState } from 'react'
import {
  adminApi,
  api,
  type ChatMessage,
  type ParticipantState,
  type Point,
  type Results,
  type RunOut,
} from './api'

const PID_KEY = 'ethics_pid'

function ethicsWord(n: number): string {
  if (n <= 2) return 'deeply unethical'
  if (n <= 4) return 'unethical'
  if (n <= 6) return 'ethically borderline'
  if (n <= 8) return 'ethical'
  return 'clearly ethical'
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
      <div className="wordmark">MDSC AI Ethics Workshop</div>
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
      <div className="wordmark">MDSC AI Ethics Workshop</div>
      <div className="card">
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
        In this session you will read a short clinical case, decide where you stand on a
        difficult decision, discuss the case with an AI, and then weigh it once more.
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
        <strong>The decision you must make</strong>
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
        <h2>{phase === 'pre' ? 'How ethical is this action?' : 'How ethical is it now?'}</h2>
        <p>
          Rate how ethical the action is — regardless of whether you would
          personally do it.
        </p>

        <div className="scale">
          <div className="scale-value">
            {score}
            <small>{ethicsWord(score)}</small>
          </div>
          <div className="scale-labels">
            <span>Completely unethical</span>
            <span>Completely ethical</span>
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
            <label>Did the conversation change your mind? If so, how? If not, why not?</label>
            <textarea
              value={changeReport}
              onChange={(e) => setChangeReport(e.target.value)}
            />
          </div>
        )}

        <div className="actions" style={{ marginTop: 18 }}>
          <button onClick={submit} disabled={busy || !rationale.trim()}>
            {phase === 'pre' ? 'Continue to the discussion' : 'Submit final rating'}
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
  const draftRef = useRef<HTMLTextAreaElement>(null)
  const autoSentRef = useRef(false)

  const startKey = `chat_start_${state.participant_id}`

  useEffect(() => {
    api
      .getMessages(state.participant_id)
      .then((loaded) => {
        setMessages(loaded)
        // Seed the conversation with the pre-rating as the student's first turn,
        // once, only when there's no history yet (so a refresh never re-sends).
        if (
          loaded.length === 0 &&
          !autoSentRef.current &&
          state.pre_score != null &&
          state.pre_rationale
        ) {
          autoSentRef.current = true
          const first = `My initial rating of how ethical this action is: ${state.pre_score}/10 — ${ethicsWord(
            state.pre_score,
          )}.\n\n${state.pre_rationale}`
          void sendContent(first)
        }
      })
      .catch(() => {})
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

  // Auto-grow the message box to fit its content (CSS caps the max height).
  useEffect(() => {
    const el = draftRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [draft])

  const studentCount = messages.filter((m) => m.role === 'student').length
  const remaining = Math.max(0, state.chat_duration_seconds - elapsed)
  // Unlock at the message floor OR the time floor — whichever comes first.
  const canContinue =
    elapsed >= state.chat_min_seconds || studentCount >= state.chat_min_student_messages
  const timeUp = remaining === 0

  const sendContent = async (content: string) => {
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

  const send = () => {
    const content = draft.trim()
    if (!content) return
    setDraft('')
    void sendContent(content)
  }

  const finish = () => setState({ ...state, phase: 'post' })

  const mm = String(Math.floor(remaining / 60)).padStart(2, '0')
  const ss = String(remaining % 60).padStart(2, '0')

  return (
    <>
      <div className="card">
        <div className="eyebrow">The Discussion</div>
        <div className="row spread">
          <h2 style={{ margin: 0 }}>Discuss the case</h2>
          <span className={`timer${remaining < 60 ? ' urgent' : ''}`}>
            {mm}:{ss}
          </span>
        </div>
        <p className="muted">
          Think aloud and discuss your view. You may continue after{' '}
          {state.chat_min_student_messages} messages or{' '}
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
            ref={draftRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Type your message…"
            rows={1}
            maxLength={2000}
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
      <CreateRun a={a} onCreated={refresh} onError={setError} />
      <Runs runs={runs} a={a} onChanged={refresh} onError={setError} />
      <OpinionGraphCard a={a} runs={runs} />
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
  onError,
}: {
  a: ReturnType<typeof adminApi>
  onCreated: () => void
  onError: (e: string) => void
}) {
  const [created, setCreated] = useState<RunOut | null>(null)
  const [busy, setBusy] = useState(false)
  const create = async () => {
    setBusy(true)
    try {
      setCreated(await a.createRun())
      onCreated()
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="card">
      <div className="eyebrow">New session</div>
      <h2>Create a run</h2>
      <div className="actions" style={{ justifyContent: 'flex-start' }}>
        <button onClick={create} disabled={busy}>
          Create a new run
        </button>
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

function Runs({
  runs,
  a,
  onChanged,
  onError,
}: {
  runs: RunOut[]
  a: ReturnType<typeof adminApi>
  onChanged: () => void
  onError: (e: string) => void
}) {
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

  const del = async (r: RunOut) => {
    const who =
      r.participant_count === 1 ? '1 participant' : `${r.participant_count} participants`
    if (
      !window.confirm(
        `Delete Run ${r.run_number} and its ${who}' data? This cannot be undone.`,
      )
    )
      return
    try {
      await a.deleteRun(r.id)
      if (openId === r.id) setOpenId(null)
      onChanged()
    } catch (e) {
      onError((e as Error).message)
    }
  }

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
              </span>{' '}
              <span className="muted">· {r.participant_count} joined</span>
            </span>
            <span className="row" style={{ gap: 8 }}>
              <button
                className="secondary"
                onClick={() => setOpenId(openId === r.id ? null : r.id)}
              >
                {openId === r.id ? 'Hide' : 'Monitor'}
              </button>
              <button
                className="secondary btn-x"
                onClick={() => del(r)}
                aria-label={`Delete run ${r.run_number}`}
                title="Delete run"
              >
                ✕
              </button>
            </span>
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

// ---- Opinion graph (dumbbell pre->post by condition) ----
const GRID = '#eceef0'
const GREY = '#9498a0'
// Condition hues (lane identity) and shift-direction hues (persuasion direction).
const COND: Record<string, string> = {
  pro: '#0d9488', // teal
  anti: '#d97706', // amber
  control: '#6366f1', // indigo
}
const TOWARD_ETHICAL = '#16a34a' // green
const TOWARD_UNETHICAL = '#dc2626' // red
const NO_CHANGE = '#9498a0' // grey
const VB_W = 600
const PAD_L = 28
const PAD_R = 28
const xFor = (score: number) => PAD_L + ((score - 1) / 9) * (VB_W - PAD_L - PAD_R)
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
const condColor = (c: string) => COND[c] ?? GREY
const shiftColor = (pre: number, post: number) =>
  post > pre ? TOWARD_ETHICAL : post < pre ? TOWARD_UNETHICAL : NO_CHANGE

const LANES: { key: string; label: string }[] = [
  { key: 'pro', label: 'Pro — argued for the action' },
  { key: 'anti', label: 'Anti — argued against it' },
  { key: 'control', label: 'Control — stayed neutral' },
  { key: 'all', label: 'All participants (pooled)' },
]

function laneStat(n: number, shift: number | null, showAfter: boolean): string {
  if (!n) return 'n = 0'
  if (!showAfter || shift == null) return `n = ${n}`
  const s = shift >= 0 ? `+${shift.toFixed(1)}` : shift.toFixed(1)
  return `n = ${n} · Δ ${s}`
}

type Dim = { band: number; r: number; topGap: number }

function Lane({
  points,
  showAfter,
  dim,
}: {
  points: Point[]
  showAfter: boolean
  dim: Dim
}) {
  const n = points.length
  const { band, r, topGap } = dim
  const yFor = (i: number) =>
    n <= 1 ? band / 2 : topGap + (i / (n - 1)) * (band - 2 * topGap)
  // Easing + per-row stagger so the reveal cascades down the lane.
  const ease = 'cubic-bezier(.22,.61,.36,1)'

  return (
    <svg viewBox={`0 0 ${VB_W} ${band}`} width="100%" height={band} style={{ display: 'block' }}>
      {/* gridlines at each integer */}
      {Array.from({ length: 10 }, (_, k) => k + 1).map((s) => (
        <line key={s} x1={xFor(s)} y1={4} x2={xFor(s)} y2={band - 4} stroke={GRID} strokeWidth={1} />
      ))}
      {/* dumbbells */}
      {points.map((p, i) => {
        const y = yFor(i)
        const preX = xFor(p.pre)
        const postX = xFor(p.post)
        const col = condColor(p.condition)
        const delay = `${i * 35}ms`
        return (
          <g key={i}>
            {/* connector — drawn under the dots, grows from the before dot */}
            <line
              x1={preX}
              y1={y}
              x2={postX}
              y2={y}
              stroke={shiftColor(p.pre, p.post)}
              strokeWidth={2}
              strokeLinecap="round"
              opacity={0.7}
              style={{
                transformBox: 'view-box',
                transformOrigin: `${preX}px ${y}px`,
                transform: showAfter ? 'scaleX(1)' : 'scaleX(0)',
                transition: `transform 700ms ${ease} ${delay}`,
              }}
            />
            {/* before dot — hollow ring in the condition hue */}
            <circle cx={preX} cy={y} r={r} fill="#fff" stroke={col} strokeWidth={2} />
            {/* after dot — solid condition hue, slides from before to post */}
            <circle
              cx={postX}
              cy={y}
              r={r}
              fill={col}
              stroke="#fff"
              strokeWidth={1}
              style={{
                transformBox: 'view-box',
                transformOrigin: `${postX}px ${y}px`,
                transform: showAfter ? 'translateX(0)' : `translateX(${preX - postX}px)`,
                opacity: showAfter ? 1 : 0,
                transition: `transform 700ms ${ease} ${delay}, opacity 500ms ${ease} ${delay}`,
              }}
            />
          </g>
        )
      })}
    </svg>
  )
}

function OpinionGraph({
  points,
  showAfter,
  fs,
}: {
  points: Point[]
  showAfter: boolean
  fs: boolean
}) {
  const dim: Dim = fs
    ? { band: 150, r: 8, topGap: 22 }
    : { band: 80, r: 4.5, topGap: 12 }
  const axisH = fs ? 44 : 30
  return (
    <div>
      {LANES.map((lane) => {
        const lp = lane.key === 'all' ? points : points.filter((p) => p.condition === lane.key)
        const n = lp.length
        const shift =
          n && showAfter ? avg(lp.map((p) => p.post)) - avg(lp.map((p) => p.pre)) : null
        return (
          <div key={lane.key} style={{ marginBottom: fs ? 14 : 8 }}>
            <div className="row spread" style={{ marginBottom: 2 }}>
              <span className="lane-label">{lane.label}</span>
              <span className="lane-stat">{laneStat(n, shift, showAfter)}</span>
            </div>
            <Lane points={lp} showAfter={showAfter} dim={dim} />
          </div>
        )
      })}
      {/* shared axis */}
      <svg viewBox={`0 0 ${VB_W} ${axisH}`} width="100%" height={axisH} style={{ display: 'block' }}>
        {Array.from({ length: 10 }, (_, k) => k + 1).map((s) => (
          <text
            key={s}
            x={xFor(s)}
            y={fs ? 16 : 12}
            textAnchor="middle"
            fontSize={fs ? 14 : 10}
            fontFamily="IBM Plex Mono, monospace"
            fill={GREY}
          >
            {s}
          </text>
        ))}
        <text x={xFor(1)} y={fs ? 36 : 26} textAnchor="start" fontSize={fs ? 12 : 9} fill={GREY}>
          Completely unethical
        </text>
        <text x={xFor(10)} y={fs ? 36 : 26} textAnchor="end" fontSize={fs ? 12 : 9} fill={GREY}>
          Completely ethical
        </text>
      </svg>
    </div>
  )
}

function GraphLegend() {
  return (
    <div className="legend">
      <span>
        <svg width="12" height="12">
          <circle cx="6" cy="6" r="4.5" fill="#fff" stroke={GREY} strokeWidth="2" />
        </svg>
        Before
      </span>
      <span>
        <svg width="12" height="12">
          <circle cx="6" cy="6" r="4.5" fill={GREY} stroke="#fff" strokeWidth="1" />
        </svg>
        After
      </span>
      <span>
        <svg width="20" height="8">
          <line x1="1" y1="4" x2="19" y2="4" stroke={TOWARD_ETHICAL} strokeWidth="2" strokeLinecap="round" />
        </svg>
        toward ethical
      </span>
      <span>
        <svg width="20" height="8">
          <line x1="1" y1="4" x2="19" y2="4" stroke={TOWARD_UNETHICAL} strokeWidth="2" strokeLinecap="round" />
        </svg>
        toward unethical
      </span>
      <span className="swatch" style={{ ['--sw' as string]: COND.pro }}>Pro</span>
      <span className="swatch" style={{ ['--sw' as string]: COND.anti }}>Anti</span>
      <span className="swatch" style={{ ['--sw' as string]: COND.control }}>Control</span>
    </div>
  )
}

function OpinionGraphCard({ a, runs }: { a: ReturnType<typeof adminApi>; runs: RunOut[] }) {
  const [points, setPoints] = useState<Point[]>([])
  const [showAfter, setShowAfter] = useState(false)
  const [runFilter, setRunFilter] = useState('all')
  const [fs, setFs] = useState(false)
  const fsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const load = () => a.points().then(setPoints).catch(() => {})
    load()
    const t = setInterval(load, 4000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Native fullscreen sets document.fullscreenElement; the CSS-overlay fallback
  // does not — so "in fallback mode" is simply (fs && no fullscreenElement).
  useEffect(() => {
    const onChange = () => setFs(document.fullscreenElement === fsRef.current)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  // Esc exits the CSS-overlay fallback (native fullscreen handles Esc itself).
  useEffect(() => {
    if (!fs) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.fullscreenElement) setFs(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fs])

  const toggleFs = async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen()
      return
    }
    if (fs) {
      // CSS-overlay fallback is active → exit it
      setFs(false)
      return
    }
    const el = fsRef.current
    if (el?.requestFullscreen) {
      try {
        await el.requestFullscreen()
        return
      } catch {
        /* fall through to CSS overlay */
      }
    }
    setFs(true)
  }

  const filtered = runFilter === 'all' ? points : points.filter((p) => p.run_id === runFilter)

  return (
    <div className="card">
      <div className="eyebrow">Opinion shift</div>
      <div ref={fsRef} className={`opinion-fs${fs ? ' is-fs' : ''}`}>
        <div className="graph-controls">
          <button onClick={() => setShowAfter((s) => !s)}>
            {showAfter ? 'Hide after' : 'Show after ▸'}
          </button>
          <select value={runFilter} onChange={(e) => setRunFilter(e.target.value)}>
            <option value="all">All runs</option>
            {runs.map((r) => (
              <option key={r.id} value={r.id}>
                Run {r.run_number}
              </option>
            ))}
          </select>
          <button className="secondary" onClick={toggleFs}>
            {fs ? 'Exit ✕' : 'Full screen ⤢'}
          </button>
          <GraphLegend />
        </div>
        {filtered.length === 0 ? (
          <p className="muted">No completed participants yet.</p>
        ) : (
          <OpinionGraph points={filtered} showAfter={showAfter} fs={fs} />
        )}
      </div>
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
