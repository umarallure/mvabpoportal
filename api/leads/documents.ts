import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'
import { z } from 'zod'

const DOCUMENT_BUCKET = 'lead-documents'
const ALLOWED_CONTENT_TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg'])
const ALLOWED_CATEGORIES = ['medical_report', 'insurance_document', 'police_report'] as const

// See api/leads/intake.ts for the rationale on the VITE_-prefixed fallback.
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

// Storage path components must not enable directory traversal. We allow only
// printable safe ASCII (letters/digits/dot/underscore/hyphen) and strip the
// rest. We also collapse leading dots so an attacker-controlled filename
// cannot resolve to ".." even if every other character is stripped.
const sanitizeFilename = (name: string): string => {
  const trimmed = name.trim().slice(0, 200)
  const cleaned = trimmed.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+/, '')
  return cleaned || 'file'
}

const bodySchema = z.object({
  submission_id: z.string()
    .trim()
    .min(8)
    .max(64)
    .regex(/^[A-Za-z0-9._-]+$/, 'submission_id may only contain letters, digits, dot, underscore, or hyphen'),
  category: z.enum(ALLOWED_CATEGORIES),
  filename: z.string().trim().min(1).max(200),
  content_type: z.string().trim().refine((v) => ALLOWED_CONTENT_TYPES.has(v), 'unsupported content_type')
}).strict()

// POST /api/leads/documents
// Returns a short-lived Supabase Storage signed upload URL for a lead's document.
// The publisher PUTs the file bytes directly to `upload_url`.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return json(res, 405, { ok: false, error: { code: 'method_not_allowed', message: 'POST only' } })
  }

  let admin: SupabaseClient
  try {
    admin = createClient(getEnv('SUPABASE_URL'), getEnv('SUPABASE_SERVICE_ROLE_KEY'))
  } catch (err) {
    console.error(JSON.stringify({ level: 'ERROR', step: 'env', msg: err instanceof Error ? err.message : String(err) }))
    return json(res, 500, { ok: false, error: { code: 'rejected_internal', message: 'Server misconfigured' } })
  }

  // 1. Authenticate publisher key (same scheme as /api/leads/intake).
  const token = getBearerToken(req)
  if (!token) {
    return json(res, 401, { ok: false, error: { code: 'rejected_auth', message: 'Missing Authorization: Bearer <api_key>' } })
  }

  const { data: keyRow, error: keyErr } = await admin
    .from('publisher_api_keys')
    .select('id, center_id, scopes, revoked_at')
    .eq('key_hash', sha256Hex(token))
    .maybeSingle()

  if (keyErr) {
    console.error(JSON.stringify({ level: 'ERROR', step: 'auth', msg: keyErr.message }))
    return json(res, 500, { ok: false, error: { code: 'rejected_internal', message: 'Authentication backend error' } })
  }

  if (!keyRow || keyRow.revoked_at) {
    return json(res, 401, { ok: false, error: { code: 'rejected_auth', message: 'Invalid or revoked API key' } })
  }

  if (!keyRow.scopes?.includes?.('leads:intake')) {
    return json(res, 403, { ok: false, error: { code: 'rejected_auth', message: 'API key is not scoped for leads:intake' } })
  }

  // 2. Parse + validate body.
  const rawBody = typeof req.body === 'string'
    ? (() => { try { return JSON.parse(req.body) } catch { return null } })()
    : req.body

  if (!rawBody || typeof rawBody !== 'object') {
    return json(res, 400, { ok: false, error: { code: 'rejected_validation', message: 'Request body must be valid JSON' } })
  }

  const parsed = bodySchema.safeParse(rawBody)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
    return json(res, 400, { ok: false, error: { code: 'rejected_validation', message: 'Request body failed validation', issues } })
  }

  const { submission_id: submissionId, category, filename, content_type: contentType } = parsed.data

  // 3. Verify the lead belongs to this publisher's center (lead_vendor).
  const { data: centerRow, error: centerErr } = await admin
    .from('centers')
    .select('lead_vendor')
    .eq('id', keyRow.center_id)
    .maybeSingle()

  if (centerErr || !centerRow?.lead_vendor) {
    return json(res, 500, { ok: false, error: { code: 'rejected_internal', message: 'API key center is not configured for lead intake' } })
  }

  const { data: leadRow, error: leadErr } = await admin
    .from('leads')
    .select('id, lead_vendor')
    .eq('submission_id', submissionId)
    .maybeSingle()

  if (leadErr) {
    return json(res, 500, { ok: false, error: { code: 'rejected_internal', message: 'Lead lookup failed' } })
  }
  if (!leadRow) {
    return json(res, 404, { ok: false, error: { code: 'not_found', message: 'No lead found for that submission_id' } })
  }
  if ((leadRow.lead_vendor ?? '').toLowerCase().trim() !== centerRow.lead_vendor.toLowerCase().trim()) {
    return json(res, 403, { ok: false, error: { code: 'rejected_auth', message: 'Lead does not belong to this publisher' } })
  }

  // 4. Build the storage path (same layout as the in-portal uploader) and
  // request a signed upload URL.
  const path = `${submissionId}/${category}/${Date.now()}_${sanitizeFilename(filename)}`
  const { data: signed, error: signErr } = await admin.storage
    .from(DOCUMENT_BUCKET)
    .createSignedUploadUrl(path)

  if (signErr || !signed) {
    console.error(JSON.stringify({ level: 'ERROR', step: 'sign', msg: signErr?.message ?? 'no signed url' }))
    return json(res, 500, { ok: false, error: { code: 'rejected_internal', message: 'Failed to create upload URL' } })
  }

  // 5. Persist the folder reference on the lead row if it isn't already set
  // (matches what the portal stores in medical_treatment_proof / etc.).
  const folderColumn =
    category === 'medical_report' ? 'medical_treatment_proof'
    : category === 'insurance_document' ? 'insurance_documents'
    : 'police_report'

  await admin
    .from('leads')
    .update({ [folderColumn]: `${submissionId}/${category}` })
    .eq('id', leadRow.id)
    .is(folderColumn, null)

  // Note: createSignedUploadUrl in supabase-js does not expose the URL's TTL
  // (it's set by your Storage configuration, default ~2h on Supabase Cloud).
  // We don't return a fabricated expires_in_seconds; publishers should treat
  // the URL as short-lived and request a new one on failure.
  return json(res, 200, {
    ok: true,
    upload_url: signed.signedUrl,
    token: signed.token,
    path: signed.path,
    method: 'PUT',
    headers: { 'Content-Type': contentType, 'x-upsert': 'false' }
  })
}
