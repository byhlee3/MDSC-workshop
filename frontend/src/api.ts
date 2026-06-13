// Minimal API client for the ethics-workshop backend.

export type Scenario = {
  id: string
  title: string
  body: string
  action_taken: string
}

export type ParticipantState = {
  participant_id: string
  phase: 'joined' | 'scenario' | 'chatting' | 'post' | 'done'
  scenario: Scenario
  chat_duration_seconds: number
  chat_min_seconds: number
  chat_min_student_messages: number
  pre_score: number | null
  post_score: number | null
  student_message_count: number
}

export type ChatMessage = { role: 'student' | 'ai'; content: string; ordinal: number }

export type Debrief = {
  condition: string
  pre_score: number
  post_score: number
  shift: number
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail || `Request failed (${res.status})`)
  }
  return res.json() as Promise<T>
}

export const api = {
  join: (joinCode: string) =>
    fetch('/api/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ join_code: joinCode }),
    }).then((r) => jsonOrThrow<ParticipantState>(r)),

  getState: (id: string) =>
    fetch(`/api/participants/${id}`).then((r) => jsonOrThrow<ParticipantState>(r)),

  consent: (id: string) =>
    fetch(`/api/participants/${id}/consent`, { method: 'POST' }).then((r) =>
      jsonOrThrow<ParticipantState>(r),
    ),

  rate: (
    id: string,
    phase: 'pre' | 'post',
    score: number,
    rationale: string,
    changeReport?: string,
  ) =>
    fetch(`/api/participants/${id}/rating?phase=${phase}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ score, rationale, change_report: changeReport }),
    }).then((r) => jsonOrThrow<ParticipantState>(r)),

  getMessages: (id: string) =>
    fetch(`/api/participants/${id}/messages`).then((r) => jsonOrThrow<ChatMessage[]>(r)),

  debrief: (id: string) =>
    fetch(`/api/participants/${id}/debrief`).then((r) => jsonOrThrow<Debrief>(r)),

  // Streams the AI reply token-by-token via the response body reader.
  async sendMessage(id: string, content: string, onDelta: (text: string) => void) {
    const res = await fetch(`/api/participants/${id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    })
    if (!res.ok || !res.body) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.detail || `Chat failed (${res.status})`)
    }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      onDelta(decoder.decode(value, { stream: true }))
    }
  },
}

// ---- Admin (password passed via header) ----
export type RunOut = {
  id: string
  run_number: number
  join_code: string
  facilitator: string
  created_at: string
}

export type MonitorParticipant = {
  participant_id: string
  phase: string
  condition: string | null
  joined_at: string
}

export type Results = {
  total_participants: number
  completed: number
  by_condition: {
    condition: string
    n: number
    mean_pre: number | null
    mean_post: number | null
    mean_shift: number | null
  }[]
}

export function adminApi(password: string) {
  const headers = { 'Content-Type': 'application/json', 'X-Admin-Password': password }
  return {
    createRun: (runNumber: number, facilitator: string) =>
      fetch('/api/admin/runs', {
        method: 'POST',
        headers,
        body: JSON.stringify({ run_number: runNumber, facilitator }),
      }).then((r) => jsonOrThrow<RunOut>(r)),
    listRuns: () =>
      fetch('/api/admin/runs', { headers }).then((r) => jsonOrThrow<RunOut[]>(r)),
    monitor: (runId: string) =>
      fetch(`/api/admin/runs/${runId}/monitor`, { headers }).then((r) =>
        jsonOrThrow<MonitorParticipant[]>(r),
      ),
    results: () =>
      fetch('/api/admin/results', { headers }).then((r) => jsonOrThrow<Results>(r)),
    exportUrl: '/api/admin/export.csv',
  }
}
