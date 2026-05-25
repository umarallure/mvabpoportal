export type SubmissionTier = 'tier_1' | 'tier_2' | 'tier_3' | 'tier_4'

export type SubmissionTierEvidenceFlags = {
  signedRetainer: boolean
  policeReport: boolean
  medicalProof: boolean
  insuranceDocument: boolean
}

export type SubmissionTierSnapshot = {
  lead_id: string
  submission_id: string
  tier: SubmissionTier | null
  price: number | null
  evidenceFlags: SubmissionTierEvidenceFlags
  source?: 'stored' | 'derived' | null
  synced?: boolean
}

type SubmissionTierDefinition = {
  label: string
  shortLabel: string
  price: number
}

export const SUBMISSION_TIER_DEFINITIONS: Record<SubmissionTier, SubmissionTierDefinition> = {
  tier_1: { label: 'Tier 1', shortLabel: 'T1', price: 1000 },
  tier_2: { label: 'Tier 2', shortLabel: 'T2', price: 1500 },
  tier_3: { label: 'Tier 3', shortLabel: 'T3', price: 2000 },
  tier_4: { label: 'Tier 4', shortLabel: 'T4', price: 3000 }
}

export const normalizeSubmissionTier = (value: unknown): SubmissionTier | null => {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized === 'tier_1' || normalized === 'tier_2' || normalized === 'tier_3' || normalized === 'tier_4') {
    return normalized
  }
  return null
}

export const getSubmissionTierBpoPrice = (tier: SubmissionTier | null | undefined) => {
  if (!tier) return null
  return SUBMISSION_TIER_DEFINITIONS[tier]?.price ?? null
}

export const deriveSubmissionTier = (
  evidenceFlags: SubmissionTierEvidenceFlags
): { tier: SubmissionTier | null; price: number | null } => {
  if (!evidenceFlags.signedRetainer) return { tier: null, price: null }

  if (evidenceFlags.insuranceDocument && evidenceFlags.medicalProof && evidenceFlags.policeReport) {
    return { tier: 'tier_4', price: getSubmissionTierBpoPrice('tier_4') }
  }

  if (evidenceFlags.medicalProof && evidenceFlags.policeReport) {
    return { tier: 'tier_3', price: getSubmissionTierBpoPrice('tier_3') }
  }

  if (evidenceFlags.policeReport) {
    return { tier: 'tier_2', price: getSubmissionTierBpoPrice('tier_2') }
  }

  return { tier: 'tier_1', price: getSubmissionTierBpoPrice('tier_1') }
}

export const formatSubmissionTierLabel = (tier: SubmissionTier | null | undefined) => {
  const normalized = normalizeSubmissionTier(tier)
  if (!normalized) return 'Unassigned'
  return SUBMISSION_TIER_DEFINITIONS[normalized]?.label ?? 'Unassigned'
}

export const formatSubmissionTierShortLabel = (tier: SubmissionTier | null | undefined) => {
  const normalized = normalizeSubmissionTier(tier)
  if (!normalized) return 'N/A'
  return SUBMISSION_TIER_DEFINITIONS[normalized]?.shortLabel ?? 'N/A'
}

export const formatSubmissionCommission = (price: number | null | undefined) => {
  if (!Number.isFinite(price ?? Number.NaN)) return '$0'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(Number(price))
}
