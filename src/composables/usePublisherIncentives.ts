import { computed, ref } from 'vue'
import { createSharedComposable } from '@vueuse/core'
import type { RealtimeChannel } from '@supabase/supabase-js'

import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'
import type { BpoIncentiveProgress, Incentive, IncentiveRule, PublisherIncentive } from '../lib/incentives'

const POLL_INTERVAL_MS = 30000

const _usePublisherIncentives = () => {
  const auth = useAuth()
  const incentives = ref<PublisherIncentive[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const ownerId = ref<string | null>(null)

  let channel: RealtimeChannel | null = null
  let pollTimer: number | null = null
  let visibilityHandler: (() => void) | null = null
  let started = false
  let syncing = false
  let requestVersion = 0

  const latestActiveIncentive = computed(() => {
    return [...incentives.value]
      .sort((a, b) => {
        const aTime = new Date(a.start_time || a.created_at).getTime()
        const bTime = new Date(b.start_time || b.created_at).getTime()
        return bTime - aTime
      })[0] ?? null
  })

  const resolveOwnerId = async () => {
    await auth.init()

    if (auth.isPublisherRole.value) {
      const leadVendor = auth.state.value.centerContext?.lead_vendor?.trim() || null
      const { data, error: ownerError } = await supabase.rpc('resolve_incentive_bpo_owner', {
        p_lead_vendor: leadVendor
      })

      if (!ownerError && typeof data === 'string' && data.trim()) {
        ownerId.value = data
        return data
      }
    }

    ownerId.value = auth.state.value.user?.id ?? null
    return ownerId.value
  }

  const fetchIncentives = async () => {
    if (syncing) return

    const requestId = ++requestVersion
    syncing = true
    loading.value = incentives.value.length === 0
    error.value = null

    try {
      const resolvedOwnerId = await resolveOwnerId()
      const nowIso = new Date().toISOString()

      const { data: incentiveRows, error: incentiveError } = await supabase
        .from('incentives')
        .select('*')
        .eq('status', 'active')
        .gt('end_time', nowIso)
        .order('end_time', { ascending: true })

      if (incentiveError) throw incentiveError

      const active = (incentiveRows ?? []) as Incentive[]
      const ids = active.map((incentive) => incentive.id)

      let rules: IncentiveRule[] = []
      let progressRows: BpoIncentiveProgress[] = []

      if (ids.length > 0) {
        const { data: ruleRows, error: rulesError } = await supabase
          .from('incentive_rules')
          .select('*')
          .in('incentive_id', ids)

        if (rulesError) throw rulesError
        rules = (ruleRows ?? []) as IncentiveRule[]

        if (resolvedOwnerId) {
          const { data: progressData, error: progressError } = await supabase
            .from('bpo_incentive_progress')
            .select('*')
            .in('incentive_id', ids)
            .eq('bpo_id', resolvedOwnerId)

          if (progressError) throw progressError
          progressRows = (progressData ?? []) as BpoIncentiveProgress[]
        }
      }

      const rulesByIncentive = new Map<string, IncentiveRule[]>()
      for (const rule of rules) {
        const existing = rulesByIncentive.get(rule.incentive_id) ?? []
        existing.push(rule)
        rulesByIncentive.set(rule.incentive_id, existing)
      }

      const progressByIncentive = new Map(
        progressRows.map((progress) => [progress.incentive_id, progress] as const)
      )

      if (requestId !== requestVersion) return

      incentives.value = active.map((incentive) => ({
        ...incentive,
        rules: rulesByIncentive.get(incentive.id) ?? [],
        progress: progressByIncentive.get(incentive.id) ?? null
      }))
    } catch (err) {
      if (requestId !== requestVersion) return

      error.value = err instanceof Error ? err.message : 'Failed to load incentives'
      incentives.value = []
    } finally {
      if (requestId === requestVersion) {
        loading.value = false
        syncing = false
      }
    }
  }

  const stopPolling = () => {
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }

  const startPolling = () => {
    if (typeof window === 'undefined') return

    stopPolling()

    const syncIfVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      void fetchIncentives()
    }

    pollTimer = window.setInterval(syncIfVisible, POLL_INTERVAL_MS)

    if (typeof document !== 'undefined' && !visibilityHandler) {
      visibilityHandler = () => {
        if (document.visibilityState === 'visible') {
          void fetchIncentives()
        }
      }
      document.addEventListener('visibilitychange', visibilityHandler)
    }
  }

  const initializeRealtime = () => {
    if (channel) {
      supabase.removeChannel(channel)
      channel = null
    }

    channel = supabase
      .channel(`publisher-incentives:${ownerId.value ?? 'unknown'}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'incentives' },
        () => { void fetchIncentives() }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bpo_incentive_progress', filter: ownerId.value ? `bpo_id=eq.${ownerId.value}` : undefined },
        () => { void fetchIncentives() }
      )
      .subscribe()
  }

  const start = async () => {
    if (started) return
    started = true
    await auth.init()
    if (!auth.isPublisherRole.value) {
      cleanup()
      return
    }
    await fetchIncentives()
    if (!started || !auth.isPublisherRole.value) return
    initializeRealtime()
    startPolling()
  }

  const cleanup = () => {
    started = false
    requestVersion += 1
    syncing = false
    incentives.value = []
    ownerId.value = null
    error.value = null
    loading.value = false
    stopPolling()

    if (visibilityHandler && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', visibilityHandler)
      visibilityHandler = null
    }

    if (channel) {
      supabase.removeChannel(channel)
      channel = null
    }
  }

  return {
    incentives,
    latestActiveIncentive,
    loading,
    error,
    ownerId,
    start,
    refetch: fetchIncentives,
    cleanup
  }
}

export const usePublisherIncentives = createSharedComposable(_usePublisherIncentives)
