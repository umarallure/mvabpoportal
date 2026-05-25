const DEFAULT_STAGE_DESCRIPTION = 'No stage description has been added yet.'

export interface TierDetailRow {
  icon: string
  label: string
  value: string
  subtext?: string
}

export interface TierDetails {
  subtitle: string
  price: string
  rows: TierDetailRow[]
}

const SUBMISSION_TIER_DETAILS: Record<string, TierDetails> = {
  qualified_tier_1: {
    subtitle: 'Transfer',
    price: '$1,000',
    rows: [
      { icon: 'i-lucide-calendar-clock', label: 'Accident Occurred', value: '12+ Months Ago' },
      { icon: 'i-lucide-heart-pulse', label: 'Type of Injury', value: 'Minor to Moderate' },
      { icon: 'i-lucide-file-x', label: 'Documentation', value: 'Minor Documentation', subtext: 'Signed Retainer' },
      { icon: 'i-lucide-scale', label: 'Liability', value: '100% Accepted', subtext: 'Or Very Strong Proof' },
    ]
  },
  qualified_tier_2: {
    subtitle: 'Bronze',
    price: '$1,500',
    rows: [
      { icon: 'i-lucide-calendar-clock', label: 'Accident Occurred', value: '6–12 Months Ago' },
      { icon: 'i-lucide-heart-pulse', label: 'Type of Injury', value: 'Moderate to Severe' },
      { icon: 'i-lucide-file-check', label: 'Documentation', value: 'Majority Documentation', subtext: 'Signed Retainer, Police Report' },
      { icon: 'i-lucide-scale', label: 'Liability', value: '100% Accepted', subtext: 'Or Very Strong Proof' },
    ]
  },
  qualified_tier_3: {
    subtitle: 'Silver',
    price: '$2,000',
    rows: [
      { icon: 'i-lucide-calendar-clock', label: 'Accident Occurred', value: '3–6 Months Ago' },
      { icon: 'i-lucide-heart-pulse', label: 'Type of Injury', value: 'Moderate to Severe' },
      { icon: 'i-lucide-file-check-2', label: 'Documentation', value: 'All Documentation', subtext: 'Signed Retainer, Proof of Medical Treatment, Police Report' },
      { icon: 'i-lucide-scale', label: 'Liability', value: '100% Accepted', subtext: 'Or Very Strong Proof' },
    ]
  },
  qualified_tier_4: {
    subtitle: 'Gold',
    price: '$3,000',
    rows: [
      { icon: 'i-lucide-calendar-clock', label: 'Accident Occurred', value: '0–3 Months Ago' },
      { icon: 'i-lucide-heart-pulse', label: 'Type of Injury', value: 'Moderate to Catastrophic' },
      { icon: 'i-lucide-file-badge', label: 'Documentation', value: 'All Documentation', subtext: 'Insurance, Proof of Medical Treatment, Police Report' },
      { icon: 'i-lucide-scale', label: 'Liability', value: '100% Accepted', subtext: 'Or Very Strong Proof' },
    ]
  },
}

const TRANSFER_STAGE_DESCRIPTIONS: Record<string, string> = {
  transfer_api: 'Fresh inbound transfer from your center via API or Zapier. Ready for closer review and first action.',
  incomplete_transfer: 'The transfer was started but not completed. It needs follow-up or re-engagement.',
  returned_to_center_dq: 'The lead was returned to the center because it did not meet transfer requirements or was disqualified.',
  previously_sold_bpo: 'This lead was already sold through BPO channels and should not be worked again.',
  needs_bpo_callback: 'A BPO-side callback or verification is needed before this lead can move forward.',
  pending_information: 'An internal callback is needed before the transfer can continue.',
  pending_approval: 'Documents were sent and the lead is waiting for the next step before final submission readiness.',
  document_signed_api: 'Documents have been signed successfully and the lead is ready for review, tiering, and submission handling.',
  application_withdrawn: 'The applicant withdrew, so this transfer is closed.'
}

const SUBMISSION_STAGE_DESCRIPTIONS: Record<string, string> = {
  retainer_signed: 'The retainer is completed and signed. The case is ready for review and tier placement.',
  qualified_missing_info: 'The retainer is signed, but required information is still incomplete and needs follow-up.',
  qualified_tier_1: 'Qualified Tier 1 case from your pipeline. Signed retainer only, commission $1,000.',
  qualified_tier_2: 'Qualified Tier 2 case from your pipeline. Signed retainer and uploaded police report, commission $1,500.',
  qualified_tier_3: 'Qualified Tier 3 case from your pipeline. Signed retainer, uploaded police report, and uploaded medical proof, commission $2,000.',
  qualified_tier_4: 'Qualified Tier 4 case from your pipeline. Signed retainer with uploaded police report, medical proof, and insurance document, commission $3,000.',
  attorney_review: 'Your case has been submitted and is waiting for attorney review.',
  attorney_rejected: 'The attorney declined the case after review. No further submission action is pending unless the case is reworked.',
  attorney_approved: 'The attorney accepted the case and it is approved to move forward.',
  qualified_payable: 'The case is approved as payable and is queued for payout processing.',
  paid_to_bpo: 'Payout has been completed to your BPO or publisher side for this case.'
}

export const getSubmissionTierDetails = (stageKey: string): TierDetails | null => {
  return SUBMISSION_TIER_DETAILS[stageKey] ?? null
}

export const getTransferStageDescription = (stageKey: string) => {
  return TRANSFER_STAGE_DESCRIPTIONS[stageKey] || DEFAULT_STAGE_DESCRIPTION
}

export const getSubmissionStageDescription = (stageKey: string) => {
  return SUBMISSION_STAGE_DESCRIPTIONS[stageKey] || DEFAULT_STAGE_DESCRIPTION
}

export { DEFAULT_STAGE_DESCRIPTION }
