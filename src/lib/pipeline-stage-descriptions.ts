const DEFAULT_STAGE_DESCRIPTION = 'No stage description has been added yet.'

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
  qualified_tier_1: 'Qualified Tier 1 case from your pipeline. Oldest accident window, lighter injuries, minimal supporting docs, price $2,500.',
  qualified_tier_2: 'Qualified Tier 2 case from your pipeline. Mid-age accident window, moderate injuries, police report included, price $3,500.',
  qualified_tier_3: 'Qualified Tier 3 case from your pipeline. More recent accident, moderate to severe injuries, stronger supporting docs, price $4,500.',
  qualified_tier_4: 'Qualified Tier 4 case from your pipeline. Most recent and highest severity cases with the strongest documentation, price $6,000.',
  attorney_review: 'Your case has been submitted and is waiting for attorney review.',
  attorney_rejected: 'The attorney declined the case after review. No further submission action is pending unless the case is reworked.',
  attorney_approved: 'The attorney accepted the case and it is approved to move forward.',
  qualified_payable: 'The case is approved as payable and is queued for payout processing.',
  paid_to_bpo: 'Payout has been completed to your BPO or publisher side for this case.'
}

export const getTransferStageDescription = (stageKey: string) => {
  return TRANSFER_STAGE_DESCRIPTIONS[stageKey] || DEFAULT_STAGE_DESCRIPTION
}

export const getSubmissionStageDescription = (stageKey: string) => {
  return SUBMISSION_STAGE_DESCRIPTIONS[stageKey] || DEFAULT_STAGE_DESCRIPTION
}

export { DEFAULT_STAGE_DESCRIPTION }
