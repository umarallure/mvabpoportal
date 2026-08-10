import { ref, readonly } from 'vue'
import { createSharedComposable } from '@vueuse/core'

import { acceptTerms, fetchPendingTerms, type TermsVersion } from '../lib/terms'

type TermsGateState = {
  loaded: boolean
  loading: boolean
  accepting: boolean
  pending: TermsVersion | null
}

type RefreshInput = {
  userId: string | null
  role: string | null
  isSuperAdmin: boolean
}

// Internal users never sign the portal terms; the server enforces the same
// exemption inside get_pending_terms, this just skips the round trip.
const EXEMPT_ROLES = new Set(['super_admin', 'admin'])

const _useTermsGate = () => {
  const state = ref<TermsGateState>({
    loaded: false,
    loading: false,
    accepting: false,
    pending: null
  })

  const refresh = async ({ userId, role, isSuperAdmin }: RefreshInput) => {
    if (!userId || isSuperAdmin || (role && EXEMPT_ROLES.has(role))) {
      state.value.pending = null
      state.value.loaded = true
      return
    }

    state.value.loading = true
    try {
      state.value.pending = await fetchPendingTerms()
    } catch (error) {
      // Fail open: an outage on the terms check must not lock users out.
      console.warn('[terms] failed to check pending terms', error)
      state.value.pending = null
    } finally {
      state.value.loading = false
      state.value.loaded = true
    }
  }

  const accept = async (typedName: string) => {
    const pending = state.value.pending
    if (!pending) return

    state.value.accepting = true
    try {
      await acceptTerms(pending.id, typedName)
      state.value.pending = null
    } finally {
      state.value.accepting = false
    }
  }

  const reload = async () => {
    state.value.loading = true
    try {
      state.value.pending = await fetchPendingTerms()
    } catch (error) {
      console.warn('[terms] failed to reload pending terms', error)
    } finally {
      state.value.loading = false
    }
  }

  const clear = () => {
    state.value.pending = null
    state.value.loaded = false
  }

  return {
    state: readonly(state),
    refresh,
    reload,
    accept,
    clear
  }
}

export const useTermsGate = createSharedComposable(_useTermsGate)
