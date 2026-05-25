import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import {
  deriveSubmissionTier,
  getSubmissionTierBpoPrice,
  normalizeSubmissionTier,
  type SubmissionTier,
  type SubmissionTierEvidenceFlags,
  type SubmissionTierSnapshot
} from '../src/lib/submission-tier'

type AppUserRow = {
  user_id: string
  role: string | null
  center_id: string | null
  is_super_admin: boolean | null
}

type LeadRow = {
  id: string
  submission_id: string
  lead_vendor: string | null
  product_tier: string | null
  product_tier_price: string | number | null
}

type RetainerAgreementRow = {
  lead_id: string | null
  submission_id: string | null
}

const STORAGE_BUCKET = 'lead-documents'
const STORAGE_CATEGORIES = ['police_report', 'medical_report', 'insurance_document'] as const
const MAX_LEAD_IDS = 500
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SAFE_STORAGE_PREFIX_RE = /^[A-Za-z0-9._-]+$/

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

const parseBody = (body: VercelRequest['body']) => {
  if (typeof body === 'string') return JSON.parse(body) as Record<string, unknown>
  if (body && typeof body === 'object') return body as Record<string, unknown>
  return {}
}

const uniq = <T,>(items: T[]) => Array.from(new Set(items))

const chunk = <T,>(items: T[], size: number) => {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

const canSeeAllLeads = (profile: AppUserRow) =>
  profile.role === 'super_admin' || profile.role === 'admin' || Boolean(profile.is_super_admin)

const emptyEvidence = (): SubmissionTierEvidenceFlags => ({
  signedRetainer: false,
  policeReport: false,
  medicalProof: false,
  insuranceDocument: false
})

const evidenceFlagForCategory = (category: string): keyof SubmissionTierEvidenceFlags | null => {
  if (category === 'police_report') return 'policeReport'
  if (category === 'medical_report') return 'medicalProof'
  if (category === 'insurance_document') return 'insuranceDocument'
  return null
}

const normalizePrice = (value: unknown) => {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const pricesMatch = (left: number | null, right: number | null) => {
  if (left === null && right === null) return true
  if (left === null || right === null) return false
  return Math.abs(left - right) < 0.005
}

const mapWithConcurrency = async <T,>(items: T[], limit: number, worker: (item: T) => Promise<void>) => {
  let nextIndex = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex
      nextIndex += 1
      await worker(items[currentIndex])
    }
  })
  await Promise.all(runners)
}

const resolveAuthContext = async (req: VercelRequest) => {
  const supabaseUrl = getEnv('SUPABASE_URL')
  const supabaseAnonKey = getEnv('SUPABASE_ANON_KEY')
  const serviceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY')

  const token = getBearerToken(req)
  if (!token) return { ok: false as const, status: 401, error: 'Missing Authorization header' }

  const authClient = createClient(supabaseUrl, supabaseAnonKey)
  const { data: userData, error: userError } = await authClient.auth.getUser(token)
  if (userError || !userData.user) {
    return { ok: false as const, status: 401, error: 'Invalid session' }
  }

  const admin = createClient(supabaseUrl, serviceRoleKey)
  const { data: profile, error: profileError } = await admin
    .from('app_users')
    .select('user_id,role,center_id,is_super_admin')
    .eq('user_id', userData.user.id)
    .maybeSingle()

  if (profileError) return { ok: false as const, status: 500, error: profileError.message }
  if (!profile) return { ok: false as const, status: 403, error: 'Portal access required' }

  const appProfile = profile as AppUserRow
  const canSeeAll = canSeeAllLeads(appProfile)
  let leadVendor: string | null = null

  if (!canSeeAll && appProfile.center_id) {
    const { data: center, error: centerError } = await admin
      .from('centers')
      .select('lead_vendor')
      .eq('id', appProfile.center_id)
      .maybeSingle()

    if (centerError) return { ok: false as const, status: 500, error: centerError.message }
    leadVendor = typeof center?.lead_vendor === 'string' ? center.lead_vendor.trim() || null : null
  }

  return { ok: true as const, admin, canSeeAll, leadVendor }
}

const fetchVisibleLeads = async (
  admin: SupabaseClient,
  leadIds: string[],
  submissionIds: string[],
  canSeeAll: boolean,
  leadVendor: string | null
) => {
  const rowsById = new Map<string, LeadRow>()

  if (!canSeeAll && !leadVendor) return []

  for (const leadIdChunk of chunk(leadIds, 100)) {
    let query = admin
      .from('leads')
      .select('id,submission_id,lead_vendor,product_tier,product_tier_price')
      .in('id', leadIdChunk)

    if (!canSeeAll) {
      query = query.eq('lead_vendor', leadVendor)
    }

    const { data, error } = await query
    if (error) throw error
    const fetchedRows = (data ?? []) as LeadRow[]
    fetchedRows.forEach((row) => rowsById.set(row.id, row))
  }

  for (const submissionIdChunk of chunk(submissionIds, 100)) {
    let query = admin
      .from('leads')
      .select('id,submission_id,lead_vendor,product_tier,product_tier_price')
      .in('submission_id', submissionIdChunk)

    if (!canSeeAll) {
      query = query.eq('lead_vendor', leadVendor)
    }

    const { data, error } = await query
    if (error) throw error
    const fetchedRows = (data ?? []) as LeadRow[]
    fetchedRows.forEach((row) => rowsById.set(row.id, row))
  }

  return Array.from(rowsById.values())
}

const fetchSignedRetainerLeadIds = async (admin: SupabaseClient, leads: LeadRow[]) => {
  const signedLeadIds = new Set<string>()
  const leadIds = leads.map((lead) => lead.id)
  const leadIdSet = new Set(leadIds)
  const submissionIdToLeadId = new Map(
    leads
      .map((lead) => [String(lead.submission_id || '').trim(), lead.id] as const)
      .filter(([submissionId]) => Boolean(submissionId))
  )
  const submissionIds = Array.from(submissionIdToLeadId.keys())

  const applyRows = (rows: RetainerAgreementRow[]) => {
    rows.forEach((row) => {
      if (row.lead_id && leadIdSet.has(row.lead_id)) {
        signedLeadIds.add(row.lead_id)
      }

      const leadId = row.submission_id ? submissionIdToLeadId.get(row.submission_id) : null
      if (leadId) signedLeadIds.add(leadId)
    })
  }

  for (const leadIdChunk of chunk(leadIds, 100)) {
    const { data, error } = await admin
      .from('retainer_agreements')
      .select('lead_id,submission_id')
      .eq('status', 'signed')
      .in('lead_id', leadIdChunk)

    if (error) throw error
    applyRows((data ?? []) as RetainerAgreementRow[])
  }

  for (const submissionIdChunk of chunk(submissionIds, 100)) {
    const { data, error } = await admin
      .from('retainer_agreements')
      .select('lead_id,submission_id')
      .eq('status', 'signed')
      .in('submission_id', submissionIdChunk)

    if (error) throw error
    applyRows((data ?? []) as RetainerAgreementRow[])
  }

  return signedLeadIds
}

const fetchStorageEvidence = async (
  admin: SupabaseClient,
  leads: LeadRow[],
  evidenceByLeadId: Map<string, SubmissionTierEvidenceFlags>
) => {
  const jobs = leads.flatMap((lead) =>
    STORAGE_CATEGORIES.map((category) => ({ lead, category }))
  )

  await mapWithConcurrency(jobs, 8, async ({ lead, category }) => {
    const submissionId = String(lead.submission_id || '').trim()
    if (!submissionId || !SAFE_STORAGE_PREFIX_RE.test(submissionId)) return

    const { data, error } = await admin.storage
      .from(STORAGE_BUCKET)
      .list(`${submissionId}/${category}`, { limit: 1, offset: 0 })

    if (error) throw error

    const hasUploadedFile = (data ?? []).some((item) => item.name && item.name !== '.emptyFolderPlaceholder')
    if (!hasUploadedFile) return

    const flag = evidenceFlagForCategory(category)
    const evidence = evidenceByLeadId.get(lead.id)
    if (flag && evidence) evidence[flag] = true
  })
}

const buildStoredTierSnapshot = (
  lead: LeadRow,
  evidenceFlags: SubmissionTierEvidenceFlags
): SubmissionTierSnapshot | null => {
  const storedTier = normalizeSubmissionTier(lead.product_tier)
  if (!storedTier) return null

  const storedPrice = normalizePrice(lead.product_tier_price)
  const price = getSubmissionTierBpoPrice(storedTier) ?? storedPrice

  return {
    lead_id: lead.id,
    submission_id: lead.submission_id,
    tier: storedTier,
    price,
    evidenceFlags,
    source: 'stored',
    synced: pricesMatch(storedPrice, price)
  }
}

const buildDerivedTierSnapshot = (
  lead: LeadRow,
  evidenceFlags: SubmissionTierEvidenceFlags
): SubmissionTierSnapshot => {
  const { tier, price } = deriveSubmissionTier(evidenceFlags)

  return {
    lead_id: lead.id,
    submission_id: lead.submission_id,
    tier,
    price,
    evidenceFlags,
    source: tier ? 'derived' : null,
    synced: false
  }
}

const shouldSyncTierFields = (lead: LeadRow, tier: SubmissionTier | null, price: number | null) => {
  const storedTier = normalizeSubmissionTier(lead.product_tier)
  const storedPrice = normalizePrice(lead.product_tier_price)
  return storedTier !== tier || !pricesMatch(storedPrice, price)
}

const syncLeadTierFields = async (
  admin: SupabaseClient,
  leadsById: Map<string, LeadRow>,
  snapshots: SubmissionTierSnapshot[]
) => {
  const syncTargets = snapshots.filter((snapshot) => {
    if (!snapshot.tier || snapshot.price === null) return false
    const lead = leadsById.get(snapshot.lead_id)
    return lead ? shouldSyncTierFields(lead, snapshot.tier, snapshot.price) : false
  })

  const results = await Promise.allSettled(syncTargets.map((snapshot) =>
    admin
      .from('leads')
      .update({
        product_tier: snapshot.tier,
        product_tier_price: snapshot.price
      })
      .eq('id', snapshot.lead_id)
  ))

  results.forEach((result, index) => {
    const snapshot = syncTargets[index]
    if (result.status === 'fulfilled' && !result.value.error) {
      snapshot.synced = true
      return
    }

    const error = result.status === 'fulfilled' ? result.value.error : result.reason
    console.warn('[submission-tier-snapshots] product tier sync failed', {
      lead_id: snapshot.lead_id,
      error
    })
  })
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('allow', 'POST')
      return json(res, 405, { error: 'Method not allowed' })
    }

    const auth = await resolveAuthContext(req)
    if (!auth.ok) return json(res, auth.status, { error: auth.error })

    const body = parseBody(req.body)
    const rawLeadIds = Array.isArray(body.lead_ids) ? body.lead_ids : []
    const rawSubmissionIds = Array.isArray(body.submission_ids) ? body.submission_ids : []
    const leadIds = uniq(rawLeadIds.map((id) => String(id || '').trim()).filter(Boolean))
    const submissionIds = uniq(rawSubmissionIds.map((id) => String(id || '').trim()).filter(Boolean))

    if (leadIds.length === 0 && submissionIds.length === 0) return json(res, 200, { snapshots: [] })
    if (leadIds.length + submissionIds.length > MAX_LEAD_IDS) return json(res, 400, { error: `Maximum ${MAX_LEAD_IDS} lead or submission IDs allowed` })
    if (leadIds.some((id) => !UUID_RE.test(id))) return json(res, 400, { error: 'Invalid lead ID' })
    if (submissionIds.some((id) => !SAFE_STORAGE_PREFIX_RE.test(id) || id.length > 64)) return json(res, 400, { error: 'Invalid submission ID' })

    const leads = await fetchVisibleLeads(auth.admin, leadIds, submissionIds, auth.canSeeAll, auth.leadVendor)
    if (leads.length === 0) return json(res, 200, { snapshots: [] })

    const leadsById = new Map(leads.map((lead) => [lead.id, lead] as const))
    const evidenceByLeadId = new Map<string, SubmissionTierEvidenceFlags>()
    leads.forEach((lead) => evidenceByLeadId.set(lead.id, emptyEvidence()))

    const leadsNeedingDerivation = leads.filter((lead) => !normalizeSubmissionTier(lead.product_tier))
    const signedRetainerLeadIds = await fetchSignedRetainerLeadIds(auth.admin, leadsNeedingDerivation)
    signedRetainerLeadIds.forEach((leadId) => {
      const evidence = evidenceByLeadId.get(leadId)
      if (evidence) evidence.signedRetainer = true
    })

    await fetchStorageEvidence(auth.admin, leadsNeedingDerivation, evidenceByLeadId)

    const snapshots: SubmissionTierSnapshot[] = leads.map((lead) => {
      const evidenceFlags = evidenceByLeadId.get(lead.id) ?? emptyEvidence()
      return buildStoredTierSnapshot(lead, evidenceFlags) ?? buildDerivedTierSnapshot(lead, evidenceFlags)
    })

    await syncLeadTierFields(auth.admin, leadsById, snapshots)

    return json(res, 200, { snapshots })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load submission tier snapshots'
    console.error('[submission-tier-snapshots] failed', error)
    return json(res, 500, { error: message })
  }
}
