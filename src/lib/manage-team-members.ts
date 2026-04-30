export type TeamMemberRow = {
  id: string
  user_id: string | null
  center_id: string
  full_name: string
  email: string | null
  phone: string | null
  position: string
  position_other: string | null
  shift_availability: string
  state: string | null
  has_portal_access: boolean
  portal_role: 'publisher_admin' | 'publisher_closer' | null
  created_at: string
  updated_at: string
}

const EDGE_FUNCTION_PATH = '/functions/v1/manage-team-members'
const EDGE_FUNCTION_BASE = import.meta.env.VITE_SUPABASE_FUNCTIONS_BASE

const edgeFunctionUrl = EDGE_FUNCTION_BASE
  ? `${String(EDGE_FUNCTION_BASE).replace(/\/$/, '')}${EDGE_FUNCTION_PATH}`
  : EDGE_FUNCTION_PATH

const buildHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json'
})

const isErrorPayload = (value: unknown): value is { error: string } =>
  typeof value === 'object' && value !== null && 'error' in value && typeof (value as Record<string, unknown>).error === 'string'

const callEdge = async <T>(options: {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  token: string
  body?: Record<string, unknown>
}) => {
  if (!options.token) {
    throw new Error('Missing auth token. Please sign in again.')
  }

  const response = await fetch(edgeFunctionUrl, {
    method: options.method,
    headers: buildHeaders(options.token),
    body: options.body ? JSON.stringify(options.body) : undefined
  })

  const contentType = response.headers.get('content-type') ?? ''
  const isJson = contentType.includes('application/json')
  const payload: unknown = isJson
    ? await response.json().catch(() => ({}))
    : await response.text().catch(() => '')

  if (!response.ok) {
    const errMsg = isJson && isErrorPayload(payload)
      ? payload.error
      : `Request failed (${response.status})`
    throw new Error(errMsg)
  }

  if (!isJson) {
    throw new Error('Unexpected response from edge function (expected JSON).')
  }

  return payload as T
}

export const listTeamMembers = (token: string) =>
  callEdge<{ members: TeamMemberRow[] }>({ method: 'GET', token })

export const createTeamMember = (token: string, body: {
  email: string
  password: string
  full_name: string
  role: 'publisher_admin' | 'publisher_closer'
  phone?: string | null
  position: string
  position_other?: string | null
  shift_availability: string
}) =>
  callEdge<{ member: TeamMemberRow | null; user_id: string }>({ method: 'POST', token, body })

export const updateTeamMember = (token: string, body: {
  id: string
  full_name?: string
  phone?: string | null
  position?: string
  position_other?: string | null
  shift_availability?: string
  role?: 'publisher_admin' | 'publisher_closer'
}) =>
  callEdge<{ member: TeamMemberRow }>({ method: 'PATCH', token, body })

export const deleteTeamMember = (token: string, id: string) =>
  callEdge<{ ok: boolean }>({ method: 'DELETE', token, body: { id } })
