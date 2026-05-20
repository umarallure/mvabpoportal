import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'
import { z } from 'zod'

type Decision =
  | 'accepted'
  | 'accepted_idempotent'
  | 'rejected_auth'
  | 'rejected_validation'
  | 'rejected_invalid_phone'
  | 'rejected_dnc'
  | 'rejected_tcpa'
  | 'rejected_tcpa_consent_missing'
  | 'rejected_rule'
  | 'rejected_state'
  | 'rejected_dnc_service'
  | 'rejected_rate_limit'
  | 'rejected_internal'

type DncFlags = { isTcpa: boolean; isDnc: boolean; isInvalid: boolean; isClean: boolean }
type DncCallStatus = 'SAFE' | 'WARNING' | 'DANGER' | 'INVALID' | 'ERROR'
type DncResponse = {
  callStatus: DncCallStatus
  message: string
  flags: DncFlags
  matchedLists: string[]
  leadDeactivated: boolean
  providers: Array<Record<string, unknown>>
}

const DNC_TIMEOUT_MS = 15_000
const SLACK_NOTIFY_TIMEOUT_MS = 5_000
const RATE_LIMIT_WINDOW_MS = 60_000

// Defense-in-depth bounds on free-text fields. The DB columns are TEXT and
// theoretically unbounded; without these a misbehaving (or compromised)
// publisher could push multi-MB rows into `leads` and `lead_intake_api_audit`.
const MAX = {
  NAME: 80,
  EMAIL: 254,                  // RFC 5321
  STREET: 200,
  CITY: 100,
  ZIP: 10,
  ID: 100,                     // vehicle reg, insurance company, etc.
  SHORT_TEXT: 200,             // police report ref, acc_* fragments
  LONG_TEXT: 5_000,            // injuries, medical_attention, accident_scenario, additional_notes
  URL: 2_000,
  CONSENT_LANGUAGE: 2_000,
  PHONE_RAW: 24,               // any reasonable formatting of a US number
  SUBMISSION_ID: 64
} as const

const US_STATE_CODES = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY'
])

// Read a required env var. For public-safe values (SUPABASE_URL,
// SUPABASE_ANON_KEY) the frontend already sets VITE_-prefixed copies on
// Vercel; we fall back to those so the project doesn't need to maintain
// two parallel sets of variables. The service-role key is never falled
// back — it MUST be unprefixed because VITE_-prefixed values are bundled
// into the browser at build time.
const ENV_FALLBACKS: Record<string, string> = {
  SUPABASE_URL: 'VITE_SUPABASE_URL',
  SUPABASE_ANON_KEY: 'VITE_SUPABASE_ANON_KEY'
}

const getEnv = (key: string): string => {
  const val = process.env[key] ?? process.env[ENV_FALLBACKS[key] ?? '']
  if (!val) throw new Error(`Missing ${key}`)
  return val
}

const json = (res: VercelResponse, status: number, body: unknown) => {
  res.status(status)
  res.setHeader('content-type', 'application/json')
  res.setHeader('cache-control', 'no-store')
  res.setHeader('x-content-type-options', 'nosniff')
  res.end(JSON.stringify(body))
}

const getBearerToken = (req: VercelRequest): string | null => {
  const raw = req.headers.authorization
  if (!raw) return null
  const [scheme, value] = raw.split(' ')
  if (!scheme || !value || scheme.toLowerCase() !== 'bearer') return null
  return value.trim() || null
}

const sha256Hex = (input: string) => createHash('sha256').update(input).digest('hex')

const normalizeUsPhone = (value: unknown): string => {
  const digits = String(value ?? '').replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1)
  return digits.length === 10 ? digits : ''
}

const toE164 = (digits10: string) => (digits10 ? `+1${digits10}` : null)

const firstHeader = (req: VercelRequest, key: string): string | null => {
  const raw = req.headers[key.toLowerCase()]
  if (Array.isArray(raw)) return raw[0] ?? null
  if (typeof raw === 'string') return raw
  return null
}

const resolveRequestIp = (req: VercelRequest): string | null => {
  const fwd = firstHeader(req, 'x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim() || null
  return firstHeader(req, 'x-real-ip')
}

// ── Validators ───────────────────────────────────────────────────────────────
const IPV4_RE = /^(25[0-5]|2[0-4]\d|[01]?\d?\d)(\.(25[0-5]|2[0-4]\d|[01]?\d?\d)){3}$/
const IPV6_RE = /^(?=.*:)[0-9a-fA-F:.]{2,45}$/

const isValidIp = (s: string): boolean => {
  if (IPV4_RE.test(s)) return true
  if (!s.includes(':')) return false
  // IPv6 — accepts ::1, ::ffff:1.2.3.4, full and compressed forms.
  return IPV6_RE.test(s)
}

const parseIsoDate = (s: string): Date | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const d = new Date(`${s}T00:00:00Z`)
  return isNaN(d.getTime()) ? null : d
}

const YEAR_MS = 365 * 24 * 60 * 60 * 1000

const isReasonableDob = (s: string): boolean => {
  const d = parseIsoDate(s)
  if (!d) return false
  const now = Date.now()
  return d.getTime() <= now && d.getTime() >= now - 120 * YEAR_MS
}

// The 12-month gate is enforced separately as a business rule; this guard
// just rules out wild values (future dates, dates older than 5 years).
const isReasonableAccidentDate = (s: string): boolean => {
  const d = parseIsoDate(s)
  if (!d) return false
  const now = Date.now()
  return d.getTime() <= now && d.getTime() >= now - 5 * YEAR_MS
}

// ── Validation schema (mirrors the columns the in-portal form writes) ──────
// Every object schema is `.strict()` so unknown fields produce a 400 instead
// of being silently dropped. Every string has a max length — without these
// a misbehaving publisher could submit multi-MB free-text values.
const tcpaConsentSchema = z.object({
  obtained: z.literal(true),
  consent_language: z.string().min(20).max(MAX.CONSENT_LANGUAGE),
  captured_at_iso: z.iso.datetime(),
  consent_source_url: z.url().max(MAX.URL).nullish()
}).strict()

const leadIntakeSchema = z.object({
  submission_id: z.string()
    .min(8)
    .max(MAX.SUBMISSION_ID)
    .regex(/^[A-Za-z0-9._-]+$/, 'submission_id may only contain letters, digits, dot, underscore, or hyphen')
    .optional(),

  first_name: z.string().trim().min(1).max(MAX.NAME),
  last_name: z.string().trim().min(1).max(MAX.NAME),
  phone_number: z.string().min(10).max(MAX.PHONE_RAW),
  email: z.email().trim().max(MAX.EMAIL),
  date_of_birth: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date_of_birth must be YYYY-MM-DD')
    .refine(isReasonableDob, 'date_of_birth must be a real date, in the past, within the last 120 years'),
  street_address: z.string().trim().min(1).max(MAX.STREET),
  street_address_2: z.string().trim().max(MAX.STREET).nullish(),
  city: z.string().trim().min(1).max(MAX.CITY),
  state: z.string().trim().length(2).transform((s) => s.toUpperCase()),
  zip_code: z.string().trim().min(3).max(MAX.ZIP),
  can_receive_texts: z.boolean().nullish(),

  accident_last_12_months: z.boolean(),
  accident_date: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'accident_date must be YYYY-MM-DD')
    .refine(isReasonableAccidentDate, 'accident_date must be in the past, within the last 5 years'),
  prior_attorney_involved: z.boolean(),
  prior_attorney_details: z.string().trim().max(MAX.LONG_TEXT).nullish(),
  signed_contract_with_attorney: z.boolean().nullish(),
  other_party_admit_fault: z.boolean(),
  police_attended: z.boolean(),
  police_report_ref: z.string().trim().max(MAX.SHORT_TEXT).nullish(),

  acc_street: z.string().trim().max(MAX.STREET).nullish(),
  acc_street2: z.string().trim().max(MAX.STREET).nullish(),
  acc_city: z.string().trim().max(MAX.CITY).nullish(),
  acc_state: z.string().trim().max(MAX.SHORT_TEXT).nullish(),
  acc_zip: z.string().trim().max(MAX.ZIP).nullish(),

  accident_scenario: z.string().trim().min(1).max(MAX.LONG_TEXT),

  received_medical_treatment: z.boolean(),
  medical_attention: z.string().trim().min(1).max(MAX.LONG_TEXT),
  injuries: z.string().trim().min(1).max(MAX.LONG_TEXT),

  insured: z.boolean(),
  vehicle_registration: z.string().trim().min(1).max(MAX.ID),
  insurance_company: z.string().trim().min(1).max(MAX.ID),
  third_party_vehicle_registration: z.string().trim().min(1).max(MAX.ID),
  passengers_count: z.number().int().min(0).max(20).nullish(),

  source_url: z.url().trim().max(MAX.URL),
  trustedform_cert_url: z.url().trim().max(MAX.URL),
  ip_address: z.string().trim().min(7).max(45).refine(isValidIp, 'ip_address must be a valid IPv4 or IPv6 address'),

  additional_notes: z.string().trim().max(MAX.LONG_TEXT).nullish(),

  tcpa_consent: tcpaConsentSchema.optional()
}).strict()

type LeadIntakeBody = z.infer<typeof leadIntakeSchema>

// ── DNC/TCPA verification (server-side call to the existing edge function) ──
const callDncLookup = async (phone10: string): Promise<DncResponse> => {
  const supabaseUrl = getEnv('SUPABASE_URL').replace(/\/$/, '')
  const anonKey = getEnv('SUPABASE_ANON_KEY')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), DNC_TIMEOUT_MS)

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/dnc-lookup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${anonKey}`,
        'apikey': anonKey
      },
      body: JSON.stringify({ mobileNumber: phone10 }),
      signal: controller.signal
    })

    const payload = await response.json().catch(() => null)
    if (!payload || typeof payload !== 'object' || !('callStatus' in payload)) {
      throw new Error(`DNC screening returned an unexpected response (${response.status}).`)
    }

    return payload as DncResponse
  } finally {
    clearTimeout(timeout)
  }
}

// ── Slack notification (same edge function the in-portal form fires) ───────
const notifySlack = async (input: {
  submissionId: string
  customerName: string
  customerState: string
  leadVendor: string
  centerName: string
}): Promise<void> => {
  const supabaseUrl = getEnv('SUPABASE_URL').replace(/\/$/, '')
  const anonKey = getEnv('SUPABASE_ANON_KEY')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), SLACK_NOTIFY_TIMEOUT_MS)

  try {
    await fetch(`${supabaseUrl}/functions/v1/lead-intake-notification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${anonKey}`,
        'apikey': anonKey
      },
      body: JSON.stringify({
        submissionId: input.submissionId,
        customerName: input.customerName,
        customerState: input.customerState,
        leadVendor: input.leadVendor,
        centerName: input.centerName,
        submissionDate: new Date().toISOString()
      }),
      signal: controller.signal
    })
  } catch (err) {
    console.warn(JSON.stringify({
      level: 'WARN',
      step: 'slack-notify',
      msg: 'Slack notification failed silently',
      submissionId: input.submissionId,
      error: err instanceof Error ? err.message : String(err)
    }))
  } finally {
    clearTimeout(timeout)
  }
}

// ── Rate limit (per-key sliding window over lead_intake_api_audit) ─────────
// We count every audit row in the window (accepted OR rejected) so a stolen
// key cannot burn DNC-provider budget by spamming rejections. If the count
// query itself errors we fail OPEN: a wedged DB shouldn't make every publisher
// look like an attacker. The query is bounded to one head-only count and is
// served by idx_lead_intake_api_audit_api_key_created_at.
const checkRateLimit = async (
  admin: SupabaseClient,
  apiKeyId: string,
  limitPerMinute: number
): Promise<{ ok: true } | { ok: false; current: number; limit: number; retryAfterSeconds: number }> => {
  if (limitPerMinute <= 0) return { ok: true }

  const windowStartIso = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString()
  const { count, error } = await admin
    .from('lead_intake_api_audit')
    .select('id', { count: 'exact', head: true })
    .eq('api_key_id', apiKeyId)
    .gte('created_at', windowStartIso)

  if (error) {
    console.error(JSON.stringify({ level: 'ERROR', step: 'rate-limit', msg: 'count query failed; failing open', error: error.message }))
    return { ok: true }
  }

  const current = count ?? 0
  if (current >= limitPerMinute) {
    return { ok: false, current, limit: limitPerMinute, retryAfterSeconds: Math.ceil(RATE_LIMIT_WINDOW_MS / 1000) }
  }
  return { ok: true }
}

// ── Business gates (same rules enforced in the portal UI) ───────────────────
const checkBusinessRules = (body: LeadIntakeBody): { ok: true } | { ok: false; reason: string } => {
  if (body.accident_last_12_months !== true) {
    return { ok: false, reason: 'accident must have occurred within the last 12 months' }
  }
  if (body.prior_attorney_involved === true) {
    return { ok: false, reason: 'customer must not already have an attorney involved' }
  }
  if (body.other_party_admit_fault !== true) {
    return { ok: false, reason: 'other party must admit fault' }
  }
  if (body.received_medical_treatment !== true) {
    return { ok: false, reason: 'customer must have received medical treatment within 2 weeks' }
  }
  if (body.police_attended !== true) {
    return { ok: false, reason: 'a police report is required' }
  }
  if (body.insured !== true) {
    return { ok: false, reason: 'customer must be insured' }
  }
  return { ok: true }
}

const generateSubmissionId = (): string => {
  const ts = Date.now().toString()
  const rand = Math.floor(Math.random() * 1_000_000).toString().padStart(6, '0')
  return ts + rand
}

const composeAccidentLocation = (body: LeadIntakeBody): string | null => {
  const parts = [body.acc_street, body.acc_street2, body.acc_city, body.acc_state, body.acc_zip]
    .map((v) => (v ?? '').trim())
    .filter(Boolean)
  return parts.length ? parts.join(', ') : null
}

const composeAdditionalNotes = (body: LeadIntakeBody): string | null => {
  const notes = (body.additional_notes ?? '').trim() || null
  const ref = (body.police_report_ref ?? '').trim()
  if (!ref) return notes
  return notes ? `Police Report #: ${ref}\n\n${notes}` : `Police Report #: ${ref}`
}

// ── Audit insertion: best-effort, never blocks the caller ───────────────────
type AuditFields = {
  apiKeyId: string | null
  centerId: string | null
  leadVendor: string | null
  submissionId: string | null
  phoneE164: string | null
  decision: Decision
  reason: string | null
  dncCallStatus: string | null
  dncResponse: unknown
  tcpaConsent: unknown
  requestIp: string | null
  userAgent: string | null
  leadId: string | null
}

const writeAudit = async (admin: SupabaseClient, fields: AuditFields) => {
  try {
    await admin.from('lead_intake_api_audit').insert({
      api_key_id: fields.apiKeyId,
      center_id: fields.centerId,
      lead_vendor: fields.leadVendor,
      submission_id: fields.submissionId,
      phone_e164: fields.phoneE164,
      decision: fields.decision,
      reason: fields.reason,
      dnc_call_status: fields.dncCallStatus,
      dnc_response: fields.dncResponse ?? null,
      tcpa_consent: fields.tcpaConsent ?? null,
      request_ip: fields.requestIp,
      user_agent: fields.userAgent,
      lead_id: fields.leadId
    })
  } catch (err) {
    console.error(JSON.stringify({
      level: 'ERROR',
      step: 'audit-write',
      msg: 'Failed to write lead intake audit row',
      decision: fields.decision,
      submissionId: fields.submissionId,
      error: err instanceof Error ? err.message : String(err)
    }))
  }
}

// ── Main handler ────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return json(res, 405, { ok: false, error: { code: 'method_not_allowed', message: 'POST only' } })
  }

  let admin: SupabaseClient
  try {
    admin = createClient(getEnv('SUPABASE_URL'), getEnv('SUPABASE_SERVICE_ROLE_KEY'))
  } catch (err) {
    console.error(JSON.stringify({ level: 'ERROR', step: 'env', msg: 'Missing required env', error: err instanceof Error ? err.message : String(err) }))
    return json(res, 500, { ok: false, error: { code: 'rejected_internal', message: 'Server misconfigured' } })
  }

  const requestIp = resolveRequestIp(req)
  const userAgent = firstHeader(req, 'user-agent')

  // 1. Authenticate the publisher API key.
  const token = getBearerToken(req)
  if (!token) {
    await writeAudit(admin, {
      apiKeyId: null, centerId: null, leadVendor: null, submissionId: null,
      phoneE164: null, decision: 'rejected_auth', reason: 'missing bearer token',
      dncCallStatus: null, dncResponse: null, tcpaConsent: null,
      requestIp, userAgent, leadId: null
    })
    return json(res, 401, { ok: false, error: { code: 'rejected_auth', message: 'Missing Authorization: Bearer <api_key>' } })
  }

  const tokenHash = sha256Hex(token)
  const { data: keyRow, error: keyErr } = await admin
    .from('publisher_api_keys')
    .select('id, center_id, scopes, revoked_at, rate_limit_per_minute')
    .eq('key_hash', tokenHash)
    .maybeSingle()

  if (keyErr) {
    console.error(JSON.stringify({ level: 'ERROR', step: 'auth', msg: 'Key lookup failed', error: keyErr.message }))
    await writeAudit(admin, {
      apiKeyId: null, centerId: null, leadVendor: null, submissionId: null,
      phoneE164: null, decision: 'rejected_internal', reason: 'key lookup failed',
      dncCallStatus: null, dncResponse: null, tcpaConsent: null,
      requestIp, userAgent, leadId: null
    })
    return json(res, 500, { ok: false, error: { code: 'rejected_internal', message: 'Authentication backend error' } })
  }

  if (!keyRow || keyRow.revoked_at) {
    await writeAudit(admin, {
      apiKeyId: keyRow?.id ?? null, centerId: keyRow?.center_id ?? null, leadVendor: null,
      submissionId: null, phoneE164: null,
      decision: 'rejected_auth',
      reason: keyRow?.revoked_at ? 'api key revoked' : 'unknown api key',
      dncCallStatus: null, dncResponse: null, tcpaConsent: null,
      requestIp, userAgent, leadId: null
    })
    return json(res, 401, { ok: false, error: { code: 'rejected_auth', message: 'Invalid or revoked API key' } })
  }

  if (!keyRow.scopes?.includes?.('leads:intake')) {
    await writeAudit(admin, {
      apiKeyId: keyRow.id, centerId: keyRow.center_id, leadVendor: null,
      submissionId: null, phoneE164: null,
      decision: 'rejected_auth', reason: 'api key lacks leads:intake scope',
      dncCallStatus: null, dncResponse: null, tcpaConsent: null,
      requestIp, userAgent, leadId: null
    })
    return json(res, 403, { ok: false, error: { code: 'rejected_auth', message: 'API key is not scoped for leads:intake' } })
  }

  // Rate limit check — runs before any paid downstream call (DNC) so a
  // compromised key cannot burn budget by spamming.
  const limit = await checkRateLimit(admin, keyRow.id, keyRow.rate_limit_per_minute ?? 60)
  if (!limit.ok) {
    await writeAudit(admin, {
      apiKeyId: keyRow.id, centerId: keyRow.center_id, leadVendor: null,
      submissionId: null, phoneE164: null,
      decision: 'rejected_rate_limit',
      reason: `exceeded ${limit.limit} requests/minute (${limit.current} in window)`,
      dncCallStatus: null, dncResponse: null, tcpaConsent: null,
      requestIp, userAgent, leadId: null
    })
    res.setHeader('retry-after', String(limit.retryAfterSeconds))
    res.setHeader('x-ratelimit-limit', String(limit.limit))
    res.setHeader('x-ratelimit-remaining', '0')
    return json(res, 429, {
      ok: false,
      error: {
        code: 'rejected_rate_limit',
        message: `Rate limit exceeded: ${limit.limit} requests per minute.`,
        retry_after_seconds: limit.retryAfterSeconds
      }
    })
  }

  // 2. Resolve the center → lead_vendor we'll stamp on the lead.
  const { data: centerRow, error: centerErr } = await admin
    .from('centers')
    .select('id, lead_vendor, center_name')
    .eq('id', keyRow.center_id)
    .maybeSingle()

  if (centerErr || !centerRow || !centerRow.lead_vendor) {
    await writeAudit(admin, {
      apiKeyId: keyRow.id, centerId: keyRow.center_id, leadVendor: null,
      submissionId: null, phoneE164: null,
      decision: 'rejected_internal', reason: 'center has no lead_vendor configured',
      dncCallStatus: null, dncResponse: null, tcpaConsent: null,
      requestIp, userAgent, leadId: null
    })
    return json(res, 500, { ok: false, error: { code: 'rejected_internal', message: 'API key center is not configured for lead intake' } })
  }

  const leadVendor = centerRow.lead_vendor
  const centerId = centerRow.id
  const centerName = centerRow.center_name ?? 'N/A'

  // 3. Parse + validate body.
  const rawBody = typeof req.body === 'string'
    ? (() => { try { return JSON.parse(req.body) } catch { return null } })()
    : req.body

  if (!rawBody || typeof rawBody !== 'object') {
    await writeAudit(admin, {
      apiKeyId: keyRow.id, centerId, leadVendor, submissionId: null, phoneE164: null,
      decision: 'rejected_validation', reason: 'invalid or missing JSON body',
      dncCallStatus: null, dncResponse: null, tcpaConsent: null,
      requestIp, userAgent, leadId: null
    })
    return json(res, 400, { ok: false, error: { code: 'rejected_validation', message: 'Request body must be valid JSON' } })
  }

  const parsed = leadIntakeSchema.safeParse(rawBody)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
    await writeAudit(admin, {
      apiKeyId: keyRow.id, centerId, leadVendor, submissionId: null, phoneE164: null,
      decision: 'rejected_validation', reason: `validation failed: ${issues.map((i) => i.path).join(', ')}`,
      dncCallStatus: null, dncResponse: null, tcpaConsent: null,
      requestIp, userAgent, leadId: null
    })
    return json(res, 400, { ok: false, error: { code: 'rejected_validation', message: 'Request body failed validation', issues } })
  }

  const body = parsed.data
  const phone10 = normalizeUsPhone(body.phone_number)
  const phoneE164 = toE164(phone10)
  const submissionId = body.submission_id?.trim() || generateSubmissionId()

  // 4. Phone format check (separate from DNC service so we get a clean reason).
  if (!phone10) {
    await writeAudit(admin, {
      apiKeyId: keyRow.id, centerId, leadVendor, submissionId, phoneE164: null,
      decision: 'rejected_invalid_phone', reason: 'phone_number must normalize to a 10-digit US number',
      dncCallStatus: null, dncResponse: null, tcpaConsent: body.tcpa_consent ?? null,
      requestIp, userAgent, leadId: null
    })
    return json(res, 422, { ok: false, error: { code: 'rejected_invalid_phone', message: 'phone_number must normalize to a 10-digit US number' } })
  }

  // 5. State coverage check (against sales_map_states).
  const customerState = body.state.toUpperCase()
  if (!US_STATE_CODES.has(customerState)) {
    await writeAudit(admin, {
      apiKeyId: keyRow.id, centerId, leadVendor, submissionId, phoneE164,
      decision: 'rejected_validation', reason: `unsupported state code "${customerState}"`,
      dncCallStatus: null, dncResponse: null, tcpaConsent: body.tcpa_consent ?? null,
      requestIp, userAgent, leadId: null
    })
    return json(res, 422, { ok: false, error: { code: 'rejected_validation', message: 'state must be a valid 2-letter US state code' } })
  }

  const { data: stateRow, error: stateErr } = await admin
    .from('sales_map_states')
    .select('state_code, availability_status')
    .eq('state_code', customerState)
    .maybeSingle()

  if (stateErr) {
    console.error(JSON.stringify({ level: 'ERROR', step: 'state-check', msg: stateErr.message }))
  }
  if (!stateRow || stateRow.availability_status !== 'unblocked') {
    await writeAudit(admin, {
      apiKeyId: keyRow.id, centerId, leadVendor, submissionId, phoneE164,
      decision: 'rejected_state', reason: `state ${customerState} is not currently accepting leads`,
      dncCallStatus: null, dncResponse: null, tcpaConsent: body.tcpa_consent ?? null,
      requestIp, userAgent, leadId: null
    })
    return json(res, 422, { ok: false, error: { code: 'rejected_state', message: `We are not accepting leads from ${customerState} right now.` } })
  }

  // 6. Business gates (same set the portal UI enforces).
  const rules = checkBusinessRules(body)
  if (!rules.ok) {
    await writeAudit(admin, {
      apiKeyId: keyRow.id, centerId, leadVendor, submissionId, phoneE164,
      decision: 'rejected_rule', reason: rules.reason,
      dncCallStatus: null, dncResponse: null, tcpaConsent: body.tcpa_consent ?? null,
      requestIp, userAgent, leadId: null
    })
    return json(res, 422, { ok: false, error: { code: 'rejected_rule', message: rules.reason } })
  }

  // 7. DNC/TCPA verification — the same edge function the portal UI calls.
  let dnc: DncResponse
  try {
    dnc = await callDncLookup(phone10)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'DNC screening failed'
    await writeAudit(admin, {
      apiKeyId: keyRow.id, centerId, leadVendor, submissionId, phoneE164,
      decision: 'rejected_dnc_service', reason: msg,
      dncCallStatus: null, dncResponse: null, tcpaConsent: body.tcpa_consent ?? null,
      requestIp, userAgent, leadId: null
    })
    return json(res, 502, { ok: false, error: { code: 'rejected_dnc_service', message: 'DNC/TCPA verification service is unavailable' } })
  }

  if (dnc.callStatus === 'DANGER' || dnc.flags?.isTcpa) {
    await writeAudit(admin, {
      apiKeyId: keyRow.id, centerId, leadVendor, submissionId, phoneE164,
      decision: 'rejected_tcpa',
      reason: dnc.message || 'TCPA litigator detected',
      dncCallStatus: dnc.callStatus, dncResponse: dnc, tcpaConsent: body.tcpa_consent ?? null,
      requestIp, userAgent, leadId: null
    })
    return json(res, 422, { ok: false, error: { code: 'rejected_tcpa', message: 'This number is flagged as a TCPA litigator and cannot be contacted.', dnc: { call_status: dnc.callStatus, matched_lists: dnc.matchedLists } } })
  }

  if (dnc.callStatus === 'INVALID') {
    await writeAudit(admin, {
      apiKeyId: keyRow.id, centerId, leadVendor, submissionId, phoneE164,
      decision: 'rejected_invalid_phone', reason: dnc.message || 'phone number invalid per DNC service',
      dncCallStatus: dnc.callStatus, dncResponse: dnc, tcpaConsent: body.tcpa_consent ?? null,
      requestIp, userAgent, leadId: null
    })
    return json(res, 422, { ok: false, error: { code: 'rejected_invalid_phone', message: dnc.message || 'phone_number is invalid' } })
  }

  if (dnc.callStatus === 'ERROR') {
    await writeAudit(admin, {
      apiKeyId: keyRow.id, centerId, leadVendor, submissionId, phoneE164,
      decision: 'rejected_dnc_service', reason: dnc.message || 'DNC service error',
      dncCallStatus: dnc.callStatus, dncResponse: dnc, tcpaConsent: body.tcpa_consent ?? null,
      requestIp, userAgent, leadId: null
    })
    return json(res, 502, { ok: false, error: { code: 'rejected_dnc_service', message: dnc.message || 'DNC/TCPA verification failed' } })
  }

  // SAFE or WARNING from here. WARNING requires structured consent.
  if (dnc.callStatus === 'WARNING' && !body.tcpa_consent) {
    await writeAudit(admin, {
      apiKeyId: keyRow.id, centerId, leadVendor, submissionId, phoneE164,
      decision: 'rejected_tcpa_consent_missing',
      reason: 'WARNING from DNC service requires tcpa_consent payload',
      dncCallStatus: dnc.callStatus, dncResponse: dnc, tcpaConsent: null,
      requestIp, userAgent, leadId: null
    })
    return json(res, 422, {
      ok: false,
      error: {
        code: 'rejected_tcpa_consent_missing',
        message: 'This number is on a DNC list. Resubmit with a tcpa_consent payload documenting verbal/written consent.',
        dnc: { call_status: dnc.callStatus, matched_lists: dnc.matchedLists }
      }
    })
  }

  // 8. Persist the lead. Schema matches the in-portal form's insert payload.
  const customerFullName = `${body.first_name.trim()} ${body.last_name.trim()}`.trim()
  const insertPayload = {
    submission_id: submissionId,
    customer_full_name: customerFullName,
    phone_number: phone10,
    can_receive_texts: body.can_receive_texts === null || body.can_receive_texts === undefined
      ? null
      : (body.can_receive_texts ? 'yes' : 'no'),
    email: body.email.trim(),
    date_of_birth: body.date_of_birth,
    street_address: body.street_address,
    city: body.city,
    state: customerState,
    zip_code: body.zip_code,
    accident_last_12_months: body.accident_last_12_months,
    accident_date: body.accident_date,
    prior_attorney_involved: body.prior_attorney_involved,
    prior_attorney_details: (body.prior_attorney_details ?? '').trim() || null,
    signed_contract_with_attorney: body.signed_contract_with_attorney ?? null,
    other_party_admit_fault: body.other_party_admit_fault,
    police_attended: body.police_attended,
    accident_location: composeAccidentLocation(body),
    accident_scenario: body.accident_scenario,
    received_medical_treatment: body.received_medical_treatment,
    medical_attention: body.medical_attention,
    is_injured: body.injuries.trim().length > 0,
    injuries: body.injuries,
    insured: body.insured,
    vehicle_registration: body.vehicle_registration,
    insurance_company: body.insurance_company,
    third_party_vehicle_registration: body.third_party_vehicle_registration,
    passengers_count: body.passengers_count ?? null,
    source_url: body.source_url,
    trustedform_cert_url: body.trustedform_cert_url,
    ip_address: body.ip_address,
    medical_treatment_proof: null,
    insurance_documents: null,
    police_report: null,
    additional_notes: composeAdditionalNotes(body),
    user_id: null,
    lead_vendor: leadVendor,
    status: 'transfer_api'
  }

  const { data: inserted, error: insertErr } = await admin
    .from('leads')
    .insert(insertPayload)
    .select('id, submission_id')
    .single()

  if (insertErr) {
    // submission_id collision → return the existing lead (idempotent).
    if (insertErr.code === '23505' && /submission_id/.test(insertErr.message)) {
      const { data: existing } = await admin
        .from('leads')
        .select('id, submission_id')
        .eq('submission_id', submissionId)
        .maybeSingle()

      await writeAudit(admin, {
        apiKeyId: keyRow.id, centerId, leadVendor, submissionId, phoneE164,
        decision: 'accepted_idempotent', reason: 'submission_id already exists',
        dncCallStatus: dnc.callStatus, dncResponse: dnc, tcpaConsent: body.tcpa_consent ?? null,
        requestIp, userAgent, leadId: existing?.id ?? null
      })

      return json(res, 200, {
        ok: true,
        idempotent: true,
        lead_id: existing?.id ?? null,
        submission_id: submissionId,
        dnc: { call_status: dnc.callStatus, flags: dnc.flags, matched_lists: dnc.matchedLists }
      })
    }

    console.error(JSON.stringify({ level: 'ERROR', step: 'insert', msg: insertErr.message }))
    await writeAudit(admin, {
      apiKeyId: keyRow.id, centerId, leadVendor, submissionId, phoneE164,
      decision: 'rejected_internal', reason: `insert failed: ${insertErr.message}`,
      dncCallStatus: dnc.callStatus, dncResponse: dnc, tcpaConsent: body.tcpa_consent ?? null,
      requestIp, userAgent, leadId: null
    })
    return json(res, 500, { ok: false, error: { code: 'rejected_internal', message: 'Failed to persist lead' } })
  }

  // 9. Mark key as used, write success audit, and fire the same Slack
  // notification the in-portal form sends. All three run in parallel; the
  // Slack call swallows its own errors so a failed post never fails the
  // submission.
  await Promise.all([
    admin.from('publisher_api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', keyRow.id),
    writeAudit(admin, {
      apiKeyId: keyRow.id, centerId, leadVendor, submissionId, phoneE164,
      decision: 'accepted', reason: null,
      dncCallStatus: dnc.callStatus, dncResponse: dnc, tcpaConsent: body.tcpa_consent ?? null,
      requestIp, userAgent, leadId: inserted.id
    }),
    notifySlack({
      submissionId,
      customerName: customerFullName,
      customerState,
      leadVendor,
      centerName
    })
  ])

  return json(res, 201, {
    ok: true,
    idempotent: false,
    lead_id: inserted.id,
    submission_id: submissionId,
    dnc: { call_status: dnc.callStatus, flags: dnc.flags, matched_lists: dnc.matchedLists }
  })
}
