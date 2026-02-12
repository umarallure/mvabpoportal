<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import { supabase } from '../lib/supabase'
import { useAuth } from '../composables/useAuth'

type StageKey =
  | 'stage_9'
  | 'stage_10'
  | 'stage_11'
  | 'stage_1'
  | 'stage_2'
  | 'stage_3'
  | 'stage_4'
  | 'stage_5'
  | 'stage_6'
  | 'stage_7'
  | 'stage_8'
  | 'stage_12'
  | 'stage_13'

const STAGES: Array<{ key: StageKey; label: string }> = [
  { key: 'stage_9', label: 'Pending Signature' },
  { key: 'stage_10', label: 'Pending Police Report' },
  { key: 'stage_11', label: 'Signed & Police Report Pending' },
  { key: 'stage_1', label: 'Information Verification' },
  { key: 'stage_2', label: 'Attorney Submission' },
  { key: 'stage_3', label: 'Insurance Verification' },
  { key: 'stage_4', label: 'Retainer Process (Email)' },
  { key: 'stage_5', label: 'Retainer Process (Postal Mail)' },
  { key: 'stage_6', label: 'Retainer Signed Pending' },
  { key: 'stage_7', label: 'Retainer Signed' },
  { key: 'stage_8', label: 'Attorney Decision' },
  { key: 'stage_12', label: 'Retainer Signed – Payable' },
  { key: 'stage_13', label: 'Retainer Paid' }
]

const stageCardClass = (stageKey: StageKey) => {
  const styles: Record<StageKey, string> = {
    stage_9: 'bg-slate-50 border border-slate-300 dark:bg-slate-950/20 dark:border-slate-600',
    stage_10: 'bg-lime-50 border border-lime-300 dark:bg-lime-950/15 dark:border-lime-700',
    stage_11: 'bg-blue-50 border border-blue-300 dark:bg-blue-950/15 dark:border-blue-700',
    stage_1: 'bg-cyan-50 border border-cyan-300 dark:bg-cyan-950/15 dark:border-cyan-700',
    stage_2: 'bg-violet-50 border border-violet-300 dark:bg-violet-950/15 dark:border-violet-700',
    stage_3: 'bg-amber-50 border border-amber-300 dark:bg-amber-950/15 dark:border-amber-700',
    stage_4: 'bg-rose-50 border border-rose-300 dark:bg-rose-950/15 dark:border-rose-700',
    stage_5: 'bg-orange-50 border border-orange-300 dark:bg-orange-950/15 dark:border-orange-700',
    stage_6: 'bg-emerald-50 border border-emerald-300 dark:bg-emerald-950/15 dark:border-emerald-700',
    stage_7: 'bg-teal-50 border border-teal-300 dark:bg-teal-950/15 dark:border-teal-700',
    stage_8: 'bg-purple-50 border border-purple-300 dark:bg-purple-950/15 dark:border-purple-700',
    stage_12: 'bg-teal-50 border border-teal-300 dark:bg-teal-950/15 dark:border-teal-700',
    stage_13: 'bg-fuchsia-50 border border-fuchsia-300 dark:bg-fuchsia-950/15 dark:border-fuchsia-700'
  }

  return styles[stageKey]
}

const buildAllowedStatuses = () => {
  const pendingApprovalStatus = 'Pending Approval'
  const withPrefix = STAGES.map((s) => s.label)
  const withoutPrefix = STAGES.map((s) => s.label.replace(/^Stage\s+\d+\s*:\s*/i, ''))
  return Array.from(new Set([pendingApprovalStatus, ...withPrefix, ...withoutPrefix]))
}

type SubmissionPortalRow = Record<string, unknown> & {
  id: string
  submission_id: string
  date?: string | null
  insured_name?: string | null
  lead_vendor?: string | null
  client_phone_number?: string | null
  buffer_agent?: string | null
  agent?: string | null
  licensed_agent_account?: string | null
  assigned_attorney_id?: string | null
  status?: string | null
  notes?: string | null
  has_submission_data?: boolean
  source_type?: string | null
}

type AttorneyProfile = {
  user_id: string
  full_name: string | null
  primary_email: string | null
}

const asRecord = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object') return value as Record<string, unknown>
  return {}
}

const getString = (record: Record<string, unknown>, key: string) => {
  const value = record[key]
  if (typeof value === 'string') return value
  if (value == null) return null
  return String(value)
}

const getBool = (record: Record<string, unknown>, key: string) => Boolean(record[key])

const deriveStageKey = (row: SubmissionPortalRow): StageKey => {
  const status = String(row.status || '').trim()
  if (!status || status === 'Pending Approval') return 'stage_1'
  const exact = STAGES.find((s) => s.label === status)
  return (exact?.key ?? 'stage_1') as StageKey
}

const getStatusForStage = (stageKey: StageKey) => {
  if (stageKey === 'stage_1') return 'Pending Approval'
  return STAGES.find((s) => s.key === stageKey)?.label ?? 'Pending Approval'
}

const auth = useAuth()
const router = useRouter()

const loading = ref(false)
const refreshing = ref(false)

const rows = ref<SubmissionPortalRow[]>([])
const attorneys = ref<AttorneyProfile[]>([])
const noteCounts = ref<Record<string, number>>({})

const fetchNoteCounts = async (currentRows: SubmissionPortalRow[] | null | undefined) => {
  const safeRows = Array.isArray(currentRows) ? currentRows : []
  const leadIds = safeRows.map((r) => String(r.id || '')).filter(Boolean)
  if (leadIds.length === 0) {
    noteCounts.value = {}
    return
  }

  const submissionMap = new Map<string, string>()
  safeRows.forEach((r) => {
    const submissionId = String(r.submission_id || '').trim()
    if (submissionId) submissionMap.set(submissionId, String(r.id))
  })

  const counts: Record<string, number> = {}
  leadIds.forEach((id) => {
    counts[id] = 0
  })

  const submissionIds = Array.from(submissionMap.keys())
  try {
    let query = supabase
      .from('lead_notes')
      .select('id,lead_id,submission_id')

    if (leadIds.length > 0) query = query.in('lead_id', leadIds)
    if (submissionIds.length > 0) query = query.in('submission_id', submissionIds)

    const { data: noteRows, error } = await query
    if (!error && Array.isArray(noteRows)) {
      const seen = new Set<string>()
      noteRows.forEach((row) => {
        const record = asRecord(row)
        const id = String(record.id ?? '')
        if (!id || seen.has(id)) return
        seen.add(id)

        const directLeadId = String(record.lead_id ?? '').trim()
        if (directLeadId && counts[directLeadId] !== undefined) {
          counts[directLeadId] = (counts[directLeadId] || 0) + 1
          return
        }

        const subId = String(record.submission_id ?? '').trim()
        if (subId) {
          const leadId = submissionMap.get(subId)
          if (leadId) counts[leadId] = (counts[leadId] || 0) + 1
        }
      })
    }
  } catch {
    // ignore
  }

  safeRows.forEach((r) => {
    if (String(r.notes || '').trim()) {
      const id = String(r.id || '')
      if (id) counts[id] = (counts[id] || 0) + 1
    }
  })

  noteCounts.value = counts
}

const searchTerm = ref('')
const dateFilter = ref('')
const statusFilter = ref('__ALL__')
const leadVendorFilter = ref('__ALL__')
const showDuplicates = ref(true)

const draggingId = ref<string | null>(null)
const dragOverStage = ref<StageKey | null>(null)

const editOpen = ref(false)
const editSaving = ref(false)
const editRow = ref<SubmissionPortalRow | null>(null)
const editStage = ref('')
const editNotes = ref('')

const canSeeAll = computed(() => {
  const role = auth.state.value.profile?.role
  const isSuperAdmin = role === 'super_admin' || Boolean(auth.state.value.profile?.is_super_admin)
  const isAdmin = role === 'admin'
  return isSuperAdmin || isAdmin
})

const canSeeLeadVendorUi = computed(() => {
  const role = auth.state.value.profile?.role
  return role === 'super_admin' || role === 'admin'
})

const authorName = computed(() => {
  const profile = auth.state.value.profile
  const display = String(profile?.display_name || '').trim()
  if (display) return display
  const email = String(profile?.email || '').trim()
  if (email) return email.split('@')[0] || email
  return auth.state.value.user?.id ?? 'unknown'
})

const attorneyById = computed(() => {
  const map = new Map<string, string>()
  attorneys.value.forEach((a) => {
    const label = String(a.full_name || a.primary_email || '').trim()
    if (!a.user_id || !label) return
    map.set(a.user_id, label)
  })
  return map
})

const leadVendorOptions = computed(() => {
  const set = new Set<string>()
  rows.value.forEach((r) => {
    const v = String(r.lead_vendor || '').trim()
    if (v) set.add(v)
  })
  const values = Array.from(set).sort((a, b) => a.localeCompare(b))
  return [{ label: 'All Vendors', value: '__ALL__' }, ...values.map((v) => ({ label: v, value: v }))]
})

const statusOptions = computed(() => {
  const allowed = buildAllowedStatuses()
  return [{ label: 'All Statuses', value: '__ALL__' }, ...allowed.map((s) => ({ label: s, value: s }))]
})

const removeDuplicates = (records: SubmissionPortalRow[]): SubmissionPortalRow[] => {
  const seen = new Map<string, SubmissionPortalRow>()
  records.forEach((record) => {
    const key = `${String(record.insured_name || '')}|${String(record.client_phone_number || '')}|${String(record.lead_vendor || '')}`
    if (!seen.has(key)) seen.set(key, record)
  })
  return Array.from(seen.values())
}

const filteredRows = computed(() => {
  let data = rows.value.slice()

  if (!canSeeAll.value) {
    const vendor = String(auth.state.value.profile?.lead_vendor ?? '').trim()
    const centerId = String(auth.state.value.profile?.center_id ?? '').trim()
    if (vendor && centerId) {
      data = data.filter((r) => {
        const rowVendor = String(r.lead_vendor || '').trim()
        const rowCenterId = String((r as Record<string, unknown>).center_id ?? '').trim()
        return rowVendor === vendor && rowCenterId === centerId
      })
    } else {
      data = []
    }
  }

  if (dateFilter.value) {
    data = data.filter((r) => String(r.date || '') === dateFilter.value)
  }

  if (statusFilter.value !== '__ALL__') {
    data = data.filter((r) => String(r.status || '') === statusFilter.value)
  }

  if (leadVendorFilter.value !== '__ALL__') {
    data = data.filter((r) => String(r.lead_vendor || '') === leadVendorFilter.value)
  }

  const q = searchTerm.value.trim().toLowerCase()
  if (q) {
    data = data.filter((r) => {
      const attorneyName = r.assigned_attorney_id ? (attorneyById.value.get(String(r.assigned_attorney_id)) ?? '') : ''
      const haystack = [
        r.id,
        r.submission_id,
        r.insured_name ?? '',
        r.client_phone_number ?? '',
        r.lead_vendor ?? '',
        r.agent ?? '',
        r.buffer_agent ?? '',
        r.licensed_agent_account ?? '',
        r.status ?? '',
        attorneyName
      ].join(' ').toLowerCase()
      return haystack.includes(q)
    })
  }

  if (!showDuplicates.value) {
    data = removeDuplicates(data)
  }

  return data
})

const leadsByStage = computed(() => {
  const grouped = new Map<StageKey, SubmissionPortalRow[]>()
  STAGES.forEach((s) => grouped.set(s.key, []))

  filteredRows.value.forEach((row) => {
    const stageKey = deriveStageKey(row)
    grouped.get(stageKey)?.push(row)
  })

  return grouped
})

const stageOptions = computed(() => {
  return STAGES.map((s) => ({ label: s.label, value: s.label }))
})

const fetchAttorneys = async () => {
  try {
    const { data, error } = await supabase
      .from('attorney_profiles')
      .select('user_id,full_name,primary_email')
      .order('full_name', { ascending: true, nullsFirst: false })

    if (error) {
      attorneys.value = []
      return
    }

    attorneys.value = (data ?? []) as AttorneyProfile[]
  } catch {
    attorneys.value = []
  }
}

const fetchData = async (showRefreshToast = false) => {
  loading.value = rows.value.length === 0
  refreshing.value = true

  try {
    await auth.init()

    const allowedStatuses = buildAllowedStatuses()

    let transfersQuery = supabase
      .from('daily_deal_flow')
      .select('*')
      .in('status', allowedStatuses)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })

    if (dateFilter.value) {
      transfersQuery = transfersQuery.eq('date', dateFilter.value)
    }

    const { data: transferData, error: transferError } = await transfersQuery

    if (transferError) {
      rows.value = []
      return
    }

    const submissionIds = Array.from(
      new Set(
        ((transferData ?? []) as unknown as SubmissionPortalRow[])
          .map((t) => String(t.submission_id || '').trim())
          .filter(Boolean)
      )
    )

    let callResultsBySubmissionId = new Map<string, Record<string, unknown>>()
    if (submissionIds.length > 0) {
      try {
        const { data: callResultsData, error: callResultsError } = await supabase
          .from('call_results')
          .select('*')
          .in('submission_id', submissionIds)

        if (!callResultsError && Array.isArray(callResultsData)) {
          callResultsBySubmissionId = new Map<string, Record<string, unknown>>()
          callResultsData.forEach((row) => {
            const record = asRecord(row)
            const submissionId = String(record.submission_id ?? '').trim()
            if (!submissionId) return
            callResultsBySubmissionId.set(submissionId, record)
          })
        }
      } catch {
        // ignore
      }
    }

    const merged = ((transferData ?? []) as unknown as SubmissionPortalRow[]).map((transfer) => {
      const transferRecord = asRecord(transfer)
      const submissionId = String(transfer.submission_id || '').trim()
      const callResult = submissionId ? callResultsBySubmissionId.get(submissionId) : undefined

      const isPendingApproval = String(transfer.status || '').trim() === 'Pending Approval'
      const hasSubmissionData = Boolean(callResult) || isPendingApproval

      const isCallback = getBool(transferRecord, 'from_callback') || getBool(transferRecord, 'is_callback')
      const sourceType = (getString(transferRecord, 'source_type') ?? (isCallback ? 'callback' : 'zapier')) as string

      if (callResult) {
        return {
          ...transfer,
          ...callResult,
          has_submission_data: hasSubmissionData,
          source_type: sourceType
        }
      }

      return {
        ...transfer,
        has_submission_data: hasSubmissionData,
        source_type: sourceType
      }
    })

    rows.value = merged
    await fetchNoteCounts(merged)

    if (showRefreshToast) {
      try {
        const toast = useToast()
        toast.add({ title: 'Success', description: 'Data refreshed successfully' })
      } catch {
        // ignore
      }
    }
  } finally {
    loading.value = false
    refreshing.value = false
  }
}

const handleDropToStage = async (rowId: string, stageKey: StageKey) => {
  const nextStatus = getStatusForStage(stageKey)

  const prev = rows.value
  const next = prev.map((r) => (r.id === rowId ? { ...r, status: nextStatus } : r))
  rows.value = next

  try {
    const { error: transferError } = await supabase
      .from('daily_deal_flow')
      .update({ status: nextStatus })
      .eq('id', rowId)

    if (transferError) throw transferError

    try {
      const toast = useToast()
      toast.add({ title: 'Status Updated', description: `Lead status updated to "${nextStatus}"` })
    } catch {
      // ignore
    }
  } catch {
    rows.value = prev
    try {
      const toast = useToast()
      toast.add({ title: 'Error', description: 'Failed to update lead status', color: 'error' })
    } catch {
      // ignore
    }
  }
}

const handleView = (row: SubmissionPortalRow) => {
  if (!row?.id) return
  router.push(`/retainers/${encodeURIComponent(String(row.id))}`)
}

const openEdit = (row: SubmissionPortalRow) => {
  editRow.value = row
  editStage.value = String(row.status || '').trim()
  editNotes.value = ''
  editOpen.value = true
}

const saveEdit = async () => {
  if (!editRow.value) return

  const nextStage = String(editStage.value || '').trim()
  if (!nextStage) return

  const rowId = editRow.value.id

  editSaving.value = true
  try {
    const { error: flowError } = await supabase
      .from('daily_deal_flow')
      .update({ status: nextStage, notes: editNotes.value })
      .eq('id', rowId)

    if (flowError) throw flowError

    const trimmedNote = String(editNotes.value || '').trim()
    if (trimmedNote) {
      try {
        await supabase.from('lead_notes').insert({
          lead_id: rowId,
          submission_id: editRow.value.submission_id ?? null,
          note: trimmedNote,
          source: 'Submission Portal',
          created_by: auth.state.value.user?.id ?? null,
          author_name: authorName.value
        })
      } catch {
        // ignore if table not present / RLS blocks
      }
    }

    rows.value = rows.value.map((r) => (r.id === rowId ? { ...r, status: nextStage, notes: editNotes.value } : r))
    await fetchNoteCounts(rows.value)

    try {
      const toast = useToast()
      toast.add({ title: 'Updated', description: 'Stage and notes updated successfully.' })
    } catch {
      // ignore
    }

    editOpen.value = false
  } catch {
    try {
      const toast = useToast()
      toast.add({ title: 'Error', description: 'Failed to update stage/notes', color: 'error' })
    } catch {
      // ignore
    }
  } finally {
    editSaving.value = false
  }
}

watch([dateFilter], () => {
  void fetchData()
})

const handleStageDrop = (stageKey: StageKey, e: DragEvent) => {
  e.preventDefault()
  const droppedId = e.dataTransfer?.getData('text/plain') || ''
  if (!droppedId) return
  void handleDropToStage(droppedId, stageKey)
  draggingId.value = null
  dragOverStage.value = null
}

const handleRowDragStart = (rowId: string, e: DragEvent) => {
  e.dataTransfer?.setData('text/plain', String(rowId))
  draggingId.value = String(rowId)
}

onMounted(async () => {
  await fetchAttorneys()
  await fetchData()
})
</script>

<template>
  <UDashboardPanel id="submission-portal">
    <template #header>
      <UDashboardNavbar title="Submission Portal">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="flex h-full min-h-0 flex-col gap-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex flex-1 flex-wrap items-center gap-3">
            <UInput
              v-model="searchTerm"
              class="max-w-md"
              icon="i-lucide-search"
              placeholder="Search by name, phone, vendor..."
            />

            <USelect
              v-if="canSeeLeadVendorUi"
              v-model="leadVendorFilter"
              class="w-56"
              :items="leadVendorOptions"
              value-key="value"
              label-key="label"
            />

            <USelect
              v-model="statusFilter"
              class="w-64"
              :items="statusOptions"
              value-key="value"
              label-key="label"
            />

            <UInput v-model="dateFilter" type="date" class="w-56" />

            <USelect
              v-model="showDuplicates"
              class="w-56"
              :items="[
                { label: 'Show All Records', value: true },
                { label: 'Remove Duplicates', value: false }
              ]"
              value-key="value"
              label-key="label"
            />
          </div>

          <div class="flex items-center gap-3">
            <UBadge variant="subtle" :label="`${filteredRows.length} records`" />

            <UButton
              color="primary"
              variant="solid"
              icon="i-lucide-refresh-cw"
              :loading="refreshing"
              @click="fetchData(true)"
            >
              Refresh
            </UButton>
          </div>
        </div>

        <div v-if="loading" class="flex flex-1 items-center justify-center text-sm text-muted">
          Loading submission portal data...
        </div>

        <div v-else class="min-h-0 flex-1 overflow-auto">
          <div
            class="flex h-full min-h-0 items-stretch gap-3 pr-2"
            :style="{ minWidth: `${STAGES.length * 18}rem` }"
          >
            <UCard
              v-for="stage in STAGES"
              :key="stage.key"
              class="flex h-full w-104 flex-col"
              :class="stageCardClass(stage.key)"
              :ui="{ body: '!p-0 !sm:p-0 min-h-0 flex-1 flex flex-col' }"
              @dragover.prevent
              @dragenter="dragOverStage = stage.key"
              @dragleave="dragOverStage = dragOverStage === stage.key ? null : dragOverStage"
              @drop="handleStageDrop(stage.key, $event)"
            >
              <div
                class="flex items-center justify-between border-b border-default px-3 py-2"
                :class="dragOverStage === stage.key ? 'bg-muted/50' : ''"
              >
                <div class="text-sm font-semibold">{{ stage.label }}</div>
                <UBadge variant="subtle" :label="String(leadsByStage.get(stage.key)?.length ?? 0)" />
              </div>

              <div class="min-h-0 flex-1 space-y-2 overflow-auto p-2">
                <UCard
                  v-for="row in (leadsByStage.get(stage.key) ?? [])"
                  :key="row.id"
                  class="w-full cursor-pointer"
                  :ui="{ body: '!p-2 sm:!p-2' }"
                  draggable="true"
                  @click="handleView(row)"
                  @dragstart="handleRowDragStart(String(row.id), $event)"
                  @dragend="() => { draggingId = null; dragOverStage = null }"
                >
                  <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0 flex-1">
                      <div class="truncate text-sm font-semibold">{{ row.insured_name || '—' }}</div>
                      <div class="mt-0.5 text-xs text-muted">
                        <div class="flex items-center gap-2">
                          <span>{{ row.client_phone_number || '—' }}</span>
                          <div class="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px]">
                            <UIcon name="i-lucide-sticky-note" class="h-3.5 w-3.5" />
                            <span>{{ noteCounts[String(row.id)] ?? 0 }}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div class="shrink-0 flex items-center gap-2">
                      <UBadge
                        v-if="row.has_submission_data === false"
                        color="neutral"
                        variant="subtle"
                        label="Missing Log"
                        size="xs"
                      />
                      <UButton
                        icon="i-lucide-pencil"
                        color="neutral"
                        variant="ghost"
                        size="xs"
                        @click.stop="openEdit(row)"
                      />
                    </div>
                  </div>

                  <div class="mt-2 flex items-center justify-between gap-2">
                    <UBadge variant="subtle" :label="String(row.lead_vendor || '—')" size="xs" />
                    <div class="text-xs text-muted">{{ String(row.date || '') }}</div>
                  </div>

                  <div class="mt-2 grid grid-cols-1 gap-1 text-xs text-muted">
                    <div>
                      <span class="font-medium">Closer:</span>
                      {{ String(row.licensed_agent_account || row.agent || row.buffer_agent || '—') }}
                    </div>
                    <div>
                      <span class="font-medium">Attorney:</span>
                      {{ row.assigned_attorney_id ? (attorneyById.get(String(row.assigned_attorney_id)) || '—') : '—' }}
                    </div>
                  </div>
                </UCard>

                <div
                  v-if="(leadsByStage.get(stage.key)?.length ?? 0) === 0"
                  class="rounded-md border border-dashed border-default px-3 py-6 text-center text-xs text-muted"
                >
                  No leads
                </div>
              </div>

              <div class="flex items-center justify-between border-t border-default px-2 py-2">
                <UButton
                  color="neutral"
                  variant="outline"
                  size="xs"
                  :disabled="true"
                >
                  Previous
                </UButton>
                <div class="text-xs text-muted">Page 1 of 1</div>
                <UButton
                  color="neutral"
                  variant="outline"
                  size="xs"
                  :disabled="true"
                >
                  Next
                </UButton>
              </div>
            </UCard>
          </div>
        </div>

        <UModal v-model:open="editOpen" title="Edit Transfer">
          <template #body>
            <div class="space-y-4">
              <UFormField label="Stage">
                <USelect
                  v-model="editStage"
                  :items="[{ label: 'Pending Approval', value: 'Pending Approval' }, ...stageOptions]"
                  value-key="value"
                  label-key="label"
                />
              </UFormField>

              <UFormField label="Notes">
                <UTextarea v-model="editNotes" :rows="5" />
              </UFormField>

              <div class="flex justify-end gap-2">
                <UButton
                  color="neutral"
                  variant="outline"
                  :disabled="editSaving"
                  @click="editOpen = false"
                >
                  Cancel
                </UButton>
                <UButton
                  color="primary"
                  variant="solid"
                  :loading="editSaving"
                  :disabled="!String(editStage || '').trim()"
                  @click="saveEdit"
                >
                  Save
                </UButton>
              </div>
            </div>
          </template>
        </UModal>
      </div>
    </template>
  </UDashboardPanel>
</template>
