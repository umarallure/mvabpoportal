<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import {
  ALL_FILTER_VALUE,
  formatSourceTypeLabel,
  matchesPipelineDateRange,
  PIPELINE_DATE_RANGE_OPTIONS,
  resolvePipelineSourceType,
  resolvePipelineState,
  type PipelineDateRange
} from '../lib/pipeline-filters'
import { supabase } from '../lib/supabase'
import { useAuth } from '../composables/useAuth'
import { getSubmissionStageDescription } from '../lib/pipeline-stage-descriptions'
import { usePipelineStages } from '../composables/usePipelineStages'

const { stages: dbStages } = usePipelineStages('submission_portal', { publisherPortalView: true })

// --- Stage helpers ---
const STAGES = computed(() => dbStages.value.map((s) => ({
  key: s.key,
  label: s.label,
  description: getSubmissionStageDescription(s.key)
})))

const stageCardClass = (stageKey: string) => {
  const stage = dbStages.value.find(s => s.key === stageKey)
  return stage?.column_class || ''
}

const buildAllowedStatuses = () => dbStages.value.map(s => s.key)

type SubmissionPortalRow = Record<string, unknown> & {
  id: string
  submission_id: string
  date?: string | null
  // leads table uses customer_full_name; fall back to insured_name for legacy rows
  customer_full_name?: string | null
  insured_name?: string | null
  state?: string | null
  lead_vendor?: string | null
  // leads table uses phone / customer_phone; fall back to client_phone_number
  phone?: string | null
  customer_phone?: string | null
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

const deriveStageKey = (row: SubmissionPortalRow): string => {
  const status = String(row.status || '').trim()
  if (!status) return STAGES.value[0]?.key ?? ''
  const matched = dbStages.value.find((s) => s.key === status)
  return matched ? matched.key : (STAGES.value[0]?.key ?? '')
}

const auth = useAuth()
const route = useRoute()
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
const filtersOpen = ref(false)
const selectedDateRange = ref<PipelineDateRange>('all')
const customStartDate = ref('')
const customEndDate = ref('')
const selectedStage = ref(ALL_FILTER_VALUE)
const selectedSourceType = ref(ALL_FILTER_VALUE)
const selectedStates = ref<string[]>([])

const editOpen = ref(false)
const editSaving = ref(false)
const editRow = ref<SubmissionPortalRow | null>(null)
const editStage = ref('')
const editNotes = ref('')

const canSeeAll = auth.canSeeAll

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

const stageFilterOptions = computed(() => [
  { label: 'All Stages', value: ALL_FILTER_VALUE },
  ...STAGES.value.map(stage => ({ label: stage.label, value: stage.key }))
])

const sourceTypeOptions = computed(() => {
  const values = Array.from(new Set(rows.value.map(row => String(row.source_type || '').trim().toLowerCase()).filter(Boolean)))
  return [
    { label: 'All Sources', value: ALL_FILTER_VALUE },
    ...values
      .sort((a, b) => formatSourceTypeLabel(a).localeCompare(formatSourceTypeLabel(b)))
      .map(value => ({ label: formatSourceTypeLabel(value), value }))
  ]
})

const stateOptions = computed(() => {
  const values = Array.from(new Set(rows.value.map(row => String(row.state || '').trim()).filter(Boolean)))
  return values
    .sort((a, b) => a.localeCompare(b))
    .map(value => ({ label: value, value }))
})

const activeFilterCount = computed(() => {
  let count = 0
  if (selectedDateRange.value !== 'all') count += 1
  if (selectedStage.value !== ALL_FILTER_VALUE) count += 1
  if (selectedSourceType.value !== ALL_FILTER_VALUE) count += 1
  if (selectedStates.value.length > 0) count += 1
  return count
})

const filteredRows = computed(() => {
  let data = rows.value.slice()

  if (!canSeeAll.value) {
    const vendor = String(auth.resolvedLeadVendor.value ?? '').trim()
    if (vendor) {
      data = data.filter((r) => String(r.lead_vendor || '').trim() === vendor)
    } else {
      data = []
    }
  }

  data = data.filter((r) => matchesPipelineDateRange(String(r.date || ''), selectedDateRange.value, customStartDate.value, customEndDate.value))

  if (selectedStage.value !== ALL_FILTER_VALUE) {
    data = data.filter((r) => deriveStageKey(r) === selectedStage.value)
  }

  if (selectedSourceType.value !== ALL_FILTER_VALUE) {
    data = data.filter((r) => String(r.source_type || '').trim().toLowerCase() === selectedSourceType.value)
  }

  if (selectedStates.value.length > 0) {
    data = data.filter((r) => selectedStates.value.includes(String(r.state || '').trim()))
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
        r.state ?? '',
        formatSourceTypeLabel(String(r.source_type || '')),
        attorneyName
      ].join(' ').toLowerCase()
      return haystack.includes(q)
    })
  }

  return data
})

const leadsByStage = computed(() => {
  const grouped = new Map<string, SubmissionPortalRow[]>()
  STAGES.value.forEach((s) => grouped.set(s.key, []))

  filteredRows.value.forEach((row) => {
    const stageKey = deriveStageKey(row)
    grouped.get(stageKey)?.push(row)
  })

  return grouped
})

const stageOptions = computed(() => {
  return dbStages.value.map((s) => ({ label: s.label, value: s.key }))
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
  const allowedKeys = buildAllowedStatuses()
  if (allowedKeys.length === 0) return // wait for stages to load via watcher

  loading.value = rows.value.length === 0
  refreshing.value = true

  try {
    await auth.init()

    let leadsQuery = supabase
      .from('leads')
      .select('*')
      .in('status', allowedKeys)
      .order('created_at', { ascending: false })

    if (!canSeeAll.value) {
      const vendor = String(auth.resolvedLeadVendor.value ?? '').trim()
      if (vendor) {
        leadsQuery = leadsQuery.eq('lead_vendor', vendor)
      }
    }

    const { data: leadsData, error: leadsError } = await leadsQuery

    if (leadsError) {
      rows.value = []
      return
    }

    const normalized = ((leadsData ?? []) as unknown as SubmissionPortalRow[]).map((lead) => {
      const record = asRecord(lead)
      const sourceType = resolvePipelineSourceType(record)
      const state = resolvePipelineState(record)
      const submissionId = String(lead.submission_id || '').trim()
      return {
        ...lead,
        insured_name: String(lead.customer_full_name || lead.insured_name || ''),
        client_phone_number: String(lead.phone || lead.customer_phone || lead.client_phone_number || ''),
        date: String(lead.date || (record.created_at as string) || ''),
        has_submission_data: Boolean(submissionId),
        source_type: sourceType,
        state
      }
    })

    rows.value = normalized
    await fetchNoteCounts(normalized)

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

const handleView = (row: SubmissionPortalRow) => {
  if (!row?.id) return
  router.push({
    path: `/retainers/${encodeURIComponent(String(row.id))}`,
    query: { from: route.fullPath }
  })
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
    const { error: leadsError } = await supabase
      .from('leads')
      .update({ status: nextStage, notes: editNotes.value })
      .eq('id', rowId)

    if (leadsError) throw leadsError

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
        console.log('Failed to insert lead note')
      }
    }

    rows.value = rows.value.map((r) => (r.id === rowId ? { ...r, status: nextStage, notes: editNotes.value } : r))
    await fetchNoteCounts(rows.value)

    try {
      const toast = useToast()
      toast.add({ title: 'Updated', description: 'Stage and notes updated successfully.' })
    } catch {
      console.log('Failed to add toast')
    }

    editOpen.value = false
  } catch {
    try {
      const toast = useToast()
      toast.add({ title: 'Error', description: 'Failed to update stage/notes', color: 'error' })
    } catch {
      console.log('Failed to add toast')
    }
  } finally {
    editSaving.value = false
  }
}

watch(dbStages, (newStages) => {
  if (newStages.length > 0) {
    void fetchData()
  }
})

onMounted(async () => {
  await fetchAttorneys()
  await fetchData()
})
</script>

<template>
  <UDashboardPanel id="submission-portal">
    <template #header>
      <UDashboardNavbar title="Submission Pipeline">
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

            <UButton
              color="neutral"
              :variant="filtersOpen || activeFilterCount > 0 ? 'solid' : 'outline'"
              icon="i-lucide-sliders-horizontal"
              @click="filtersOpen = !filtersOpen"
            >
              Filters
              <UBadge
                v-if="activeFilterCount > 0"
                variant="subtle"
                color="neutral"
                size="xs"
                class="ml-2"
                :label="String(activeFilterCount)"
              />
            </UButton>
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

        <UCard
          v-if="filtersOpen"
          class="border-primary/20"
          :ui="{ body: 'p-4 sm:p-5' }"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-sliders-horizontal" class="size-5 text-muted" />
              <div class="text-lg font-semibold">Filters</div>
            </div>

            <UButton
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              size="sm"
              @click="filtersOpen = false"
            />
          </div>

          <div class="mt-4 grid gap-4 lg:grid-cols-4">
            <UFormField label="Date Range">
              <USelect
                v-model="selectedDateRange"
                :items="PIPELINE_DATE_RANGE_OPTIONS"
                value-key="value"
                label-key="label"
              />
            </UFormField>

            <UFormField label="Stage">
              <USelect
                v-model="selectedStage"
                :items="stageFilterOptions"
                value-key="value"
                label-key="label"
              />
            </UFormField>

            <UFormField label="Source Type">
              <USelect
                v-model="selectedSourceType"
                :items="sourceTypeOptions"
                value-key="value"
                label-key="label"
              />
            </UFormField>

            <UFormField label="State">
              <USelectMenu
                v-model="selectedStates"
                :items="stateOptions"
                value-key="value"
                label-key="label"
                multiple
                placeholder="All States"
                :search-input="{ placeholder: 'Search states...' }"
              />
            </UFormField>
          </div>

          <div v-if="selectedDateRange === 'custom'" class="mt-4 grid gap-4 sm:grid-cols-2">
            <UFormField label="Start Date">
              <UInput v-model="customStartDate" type="date" />
            </UFormField>

            <UFormField label="End Date">
              <UInput v-model="customEndDate" type="date" />
            </UFormField>
          </div>
        </UCard>

        <div v-if="loading" class="flex flex-1 items-center justify-center text-sm text-muted">
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-loader-2" class="h-4 w-4 animate-spin" />
            <span>Loading submission pipeline data</span>
          </div>
        </div>

        <div v-else class="min-h-0 flex-1 overflow-auto p-2">
          <div
            class="flex h-full min-h-0 items-stretch gap-3 pr-2"
            :style="{ minWidth: `${STAGES.length * 18}rem` }"
          >
            <UCard
              v-for="stage in STAGES"
              :key="stage.key"
              class="flex min-h-[560px] w-[26rem] flex-col"
              :class="stageCardClass(stage.key)"
              :ui="{ body: '!p-0 !sm:p-0 min-h-0 flex-1 flex flex-col' }"
            >
              <div class="flex items-center justify-between border-b border-default px-3 py-2">
                <div class="flex min-w-0 items-center gap-1.5">
                  <div class="truncate text-sm font-semibold">{{ stage.label }}</div>
                  <UPopover
                    mode="hover"
                    arrow
                    :open-delay="100"
                    :close-delay="120"
                    :content="{ side: 'top', align: 'start', sideOffset: 8 }"
                  >
                    <UButton
                      icon="i-lucide-circle-help"
                      color="neutral"
                      variant="ghost"
                      size="xs"
                      class="shrink-0"
                      :ui="{ base: 'rounded-full' }"
                    />
                    <template #content>
                      <div class="max-w-72 p-3">
                        <div class="text-sm font-semibold text-highlighted">{{ stage.label }}</div>
                        <p class="mt-1 text-xs leading-5 text-muted">{{ stage.description }}</p>
                      </div>
                    </template>
                  </UPopover>
                </div>
                <UBadge variant="subtle" :label="String(leadsByStage.get(stage.key)?.length ?? 0)" />
              </div>

              <div class="min-h-0 flex-1 space-y-2 overflow-auto p-2">
                <UCard
                  v-for="row in (leadsByStage.get(stage.key) ?? [])"
                  :key="row.id"
                  class="w-full cursor-pointer"
                  :ui="{ body: '!p-2 sm:!p-2' }"
                  @click="handleView(row)"
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
                    <div class="text-xs text-muted">
                      {{ String(row.date || '') }}
                    </div>
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
                  :items="stageOptions"
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
