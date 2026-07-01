export type IncentiveRule = {
  id: string
  incentive_id: string
  state: string | null
  max_sol_months: number | null
  attorney_id: string | null
}

export type Incentive = {
  id: string
  title: string
  description: string | null
  payout_amount: number | string
  target_type: 'first_to_finish' | 'milestone'
  target_quantity: number
  status: 'pending' | 'active' | 'paused' | 'completed' | 'expired' | 'rejected' | 'archived'
  creator_id: string
  approver_id: string | null
  start_time: string | null
  end_time: string
  created_at: string
  updated_at: string
}

export type BpoIncentiveProgress = {
  id: string
  incentive_id: string
  bpo_id: string
  current_count: number
  is_completed: boolean
  completed_at: string | null
  created_at?: string | null
  updated_at?: string | null
}

export type PublisherIncentive = Incentive & {
  rules: IncentiveRule[]
  progress: BpoIncentiveProgress | null
}

export const formatIncentiveCurrency = (value: number | string | null | undefined) => {
  const amount = Number(value ?? 0)
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2
  }).format(Number.isFinite(amount) ? amount : 0)
}

export const getIncentiveProgressPercent = (incentive: PublisherIncentive) => {
  const target = Number(incentive.target_quantity || 1)
  const current = Number(incentive.progress?.current_count ?? 0)
  if (target <= 0) return 0
  return Math.min(100, Math.round((current / target) * 100))
}

export const formatIncentiveTarget = (incentive: Pick<Incentive, 'target_type' | 'target_quantity'>) => {
  if (incentive.target_type === 'first_to_finish') {
    return incentive.target_quantity === 1
      ? 'First qualified sale wins'
      : `First to ${incentive.target_quantity} qualified sales`
  }

  return `${incentive.target_quantity} qualified sale${incentive.target_quantity === 1 ? '' : 's'}`
}

export const formatIncentiveRules = (rules: IncentiveRule[]) => {
  if (!rules.length) return ['All qualified payable cases']

  return rules.map((rule) => {
    const parts: string[] = []
    if (rule.state) parts.push(rule.state.toUpperCase())
    if (rule.max_sol_months !== null && rule.max_sol_months !== undefined) parts.push(`SOL <= ${rule.max_sol_months}mo`)
    if (rule.attorney_id) parts.push('Specific attorney')
    return parts.length ? parts.join(' | ') : 'All qualified payable cases'
  })
}
