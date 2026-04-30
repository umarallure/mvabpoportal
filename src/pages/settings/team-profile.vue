<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useAuth } from '../../composables/useAuth'
import { supabase } from '../../lib/supabase'

interface TeamMember {
  id: string
  lawyer_id: string
  publisher_id: string | null
  center_id: string | null
  full_name: string
  email: string | null
  phone: string | null
  position: string
  position_other: string | null
  shift_availability: string
}

const auth = useAuth()
const toast = useToast()

const loading = ref(false)
const saving = ref(false)
const deleting = ref<string | null>(null)
const members = ref<TeamMember[]>([])

// Add member modal
const addModal = ref(false)

// Inline edit state
const editingId = ref<string | null>(null)
const editForm = reactive({ full_name: '', email: '', phone: '', position: '', position_other: '', shift_availability: '', id: '' })

// Delete confirmation
const deleteModal = ref(false)
const deleteTarget = ref<TeamMember | null>(null)

const ownerUserId = computed(() => auth.state.value.user?.id ?? '')
const centerId = computed(() => auth.state.value.profile?.center_id ?? '')

const POSITION_OPTIONS = [
  { label: 'Accounting', value: 'accounting' },
  { label: 'Marketing', value: 'marketing' },
  { label: 'Invoicing', value: 'invoicing' },
  { label: 'Intake Team', value: 'intake_team' },
  { label: 'Other', value: 'other' }
]

const SHIFT_OPTIONS = [
  { label: 'Morning', value: 'morning' },
  { label: 'Afternoon', value: 'afternoon' },
  { label: 'Evening', value: 'evening' },
  { label: 'Full Day', value: 'full_day' }
]

const emptyForm = () => ({
  full_name: '',
  email: '',
  phone: '',
  position: '',
  position_other: '',
  shift_availability: ''
})

const form = reactive(emptyForm())

const resetForm = () => {
  Object.assign(form, emptyForm())
}

const positionLabel = (pos: string, other: string | null) => {
  if (pos === 'other') return other || 'Other'
  return POSITION_OPTIONS.find(o => o.value === pos)?.label ?? pos
}

const shiftLabel = (shift: string) => {
  return SHIFT_OPTIONS.find(o => o.value === shift)?.label ?? shift
}

const getInitials = (name: string) => {
  return name.split(/\s+/).map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
}

const memberCountLabel = computed(() => {
  const n = members.value.length
  return n === 1 ? '1 member' : `${n} members`
})

const loadMembers = async () => {
  if (!ownerUserId.value && !centerId.value) return
  loading.value = true
  try {
    let query = supabase
      .from('team_members')
      .select('*')
      .order('full_name', { ascending: true })

    query = centerId.value
      ? query.eq('center_id', centerId.value)
      : query.or(`publisher_id.eq.${ownerUserId.value},lawyer_id.eq.${ownerUserId.value}`)

    const { data, error } = await query

    if (error) throw error
    members.value = data ?? []
  } catch (err) {
    toast.add({
      title: 'Error',
      description: err instanceof Error ? err.message : 'Failed to load team members',
      icon: 'i-lucide-x',
      color: 'error'
    })
  } finally {
    loading.value = false
  }
}

const addMember = async () => {
  if (!form.full_name.trim() || !form.position || !form.shift_availability) {
    toast.add({
      title: 'Missing fields',
      description: 'Full name, position, and shift are required.',
      icon: 'i-lucide-alert-circle',
      color: 'warning'
    })
    return
  }

  if (!ownerUserId.value) return

  saving.value = true
  try {
    const payload = {
      lawyer_id: ownerUserId.value,
      center_id: centerId.value || null,
      // BPO center teams are scoped by center_id. Keep publisher_id only for
      // legacy rows created before centers were available.
      publisher_id: centerId.value ? null : ownerUserId.value,
      full_name: form.full_name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      position: form.position,
      position_other: form.position === 'other' ? (form.position_other.trim() || null) : null,
      shift_availability: form.shift_availability
    }

    const { error } = await supabase.from('team_members').insert(payload)
    if (error) throw error

    toast.add({
      title: 'Member added',
      description: `${payload.full_name} has been added to the team.`,
      icon: 'i-lucide-check',
      color: 'success'
    })

    resetForm()
    addModal.value = false
    await loadMembers()
  } catch (err) {
    toast.add({
      title: 'Error',
      description: err instanceof Error ? err.message : 'Failed to add member',
      icon: 'i-lucide-x',
      color: 'error'
    })
  } finally {
    saving.value = false
  }
}

const openEdit = (member: TeamMember) => {
  editingId.value = member.id
  Object.assign(editForm, {
    id: member.id,
    full_name: member.full_name,
    email: member.email ?? '',
    phone: member.phone ?? '',
    position: member.position,
    position_other: member.position_other ?? '',
    shift_availability: member.shift_availability
  })
}

const cancelEdit = () => {
  editingId.value = null
}

const saveEdit = async () => {
  if (!editForm.full_name.trim() || !editForm.position || !editForm.shift_availability) {
    toast.add({
      title: 'Missing fields',
      description: 'Full name, position, and shift are required.',
      icon: 'i-lucide-alert-circle',
      color: 'warning'
    })
    return
  }

  saving.value = true
  try {
    const payload = {
      full_name: editForm.full_name.trim(),
      email: editForm.email.trim() || null,
      phone: editForm.phone.trim() || null,
      position: editForm.position,
      position_other: editForm.position === 'other' ? (editForm.position_other.trim() || null) : null,
      shift_availability: editForm.shift_availability
    }

    let query = supabase
      .from('team_members')
      .update(payload)
      .eq('id', editForm.id)

    if (centerId.value) {
      query = query.eq('center_id', centerId.value)
    }

    const { error } = await query

    if (error) throw error

    toast.add({
      title: 'Member updated',
      description: `${payload.full_name} has been updated.`,
      icon: 'i-lucide-check',
      color: 'success'
    })

    editingId.value = null
    await loadMembers()
  } catch (err) {
    toast.add({
      title: 'Error',
      description: err instanceof Error ? err.message : 'Failed to update member',
      icon: 'i-lucide-x',
      color: 'error'
    })
  } finally {
    saving.value = false
  }
}

const confirmDelete = (member: TeamMember) => {
  deleteTarget.value = member
  deleteModal.value = true
}

const executeDelete = async () => {
  if (!deleteTarget.value) return
  const member = deleteTarget.value
  deleting.value = member.id
  deleteModal.value = false
  try {
    let query = supabase
      .from('team_members')
      .delete()
      .eq('id', member.id)

    if (centerId.value) {
      query = query.eq('center_id', centerId.value)
    }

    const { error } = await query

    if (error) throw error

    toast.add({
      title: 'Member removed',
      description: `${member.full_name} has been removed.`,
      icon: 'i-lucide-check',
      color: 'success'
    })

    await loadMembers()
  } catch (err) {
    toast.add({
      title: 'Error',
      description: err instanceof Error ? err.message : 'Failed to delete member',
      icon: 'i-lucide-x',
      color: 'error'
    })
  } finally {
    deleting.value = null
    deleteTarget.value = null
  }
}

onMounted(async () => {
  await auth.init()
  await loadMembers()
})
</script>

<template>
  <div class="space-y-5 pb-8">

    <!-- ═══ Page Header Row ══════════════════════════════════════════════ -->
    <div class="ap-fade-in ap-delay-1 flex items-center justify-between gap-4">
      <div class="flex items-center gap-3">
        <div class="relative flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--ap-accent)]/10 ring-1 ring-[var(--ap-accent)]/25">
          <UIcon name="i-lucide-users" class="text-lg text-[var(--ap-accent)]" />
          <span class="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#1a1a1a] bg-emerald-400" />
        </div>
        <div>
          <h1 class="text-xl font-bold text-highlighted">Team Profile</h1>
          <p class="text-[11px] text-muted">Manage the members of your BPO team</p>
        </div>
      </div>

      <UButton size="sm" @click="addModal = true">
        <template #leading>
          <UIcon name="i-lucide-plus" class="text-xs" />
        </template>
        Add Member
      </UButton>
    </div>

    <!-- ═══ Team Members Card ════════════════════════════════════════════ -->
    <div class="ap-fade-in ap-delay-2 relative flex flex-col overflow-hidden rounded-xl border border-[var(--ap-accent)]/25 bg-white/90 shadow-lg backdrop-blur-sm transition-shadow duration-300 hover:shadow-xl dark:bg-[#1a1a1a]/60">
      <div class="pointer-events-none absolute inset-0 bg-gradient-to-br from-[var(--ap-accent)]/[0.04] via-transparent to-transparent" />

      <!-- Card Header -->
      <div class="relative border-b border-black/[0.06] dark:border-white/[0.06]">
        <div class="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[var(--ap-accent)]/[0.08] to-transparent" />
        <div class="absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-[var(--ap-accent)] via-[var(--ap-accent)]/60 to-transparent" />
        <div class="relative flex items-center justify-between gap-3 px-5 py-3.5">
          <div class="flex items-center gap-3">
            <div class="flex h-7 w-7 items-center justify-center rounded-lg border-[0.5px] border-[var(--ap-accent)]/45 bg-[var(--ap-accent)]/10">
              <UIcon name="i-lucide-contact" class="text-xs text-[var(--ap-accent)]" />
            </div>
            <span class="text-[13px] font-semibold text-highlighted">Team Members</span>
          </div>
          <span v-if="!loading && members.length > 0" class="rounded-md border border-[var(--ap-accent)]/30 bg-[var(--ap-accent)]/10 px-2 py-0.5 text-[11px] font-medium text-[var(--ap-accent)]">{{ memberCountLabel }}</span>
        </div>
      </div>

      <!-- Body -->
      <div class="relative flex-1">

        <!-- Loading -->
        <div v-if="loading" class="flex flex-col items-center gap-3 py-14 text-center">
          <UIcon name="i-lucide-loader-2" class="size-6 animate-spin text-[var(--ap-accent)]" />
          <p class="text-xs text-muted">Loading team members...</p>
        </div>

        <!-- Empty -->
        <div v-else-if="members.length === 0" class="flex flex-col items-center gap-4 py-14 text-center">
          <div class="flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--ap-accent)]/20 bg-[var(--ap-accent)]/[0.06]">
            <UIcon name="i-lucide-user-plus" class="size-7 text-[var(--ap-accent)]/60" />
          </div>
          <div>
            <p class="text-sm font-medium text-highlighted">No team members yet</p>
            <p class="mt-1 text-xs text-muted">Click "Add Member" above to get started.</p>
          </div>
          <UButton size="xs" variant="outline" class="mt-1" @click="addModal = true">
            <template #leading>
              <UIcon name="i-lucide-plus" class="text-xs" />
            </template>
            Add Member
          </UButton>
        </div>

        <!-- Populated List -->
        <div v-else>
          <div
            v-for="member in members"
            :key="member.id"
            class="border-b border-black/[0.04] last:border-0 dark:border-white/[0.04]"
          >
            <!-- ── Display Row ── -->
            <div
              v-if="editingId !== member.id"
              class="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--ap-accent)]/[0.02] sm:px-5"
            >
              <!-- Initials Avatar -->
              <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--ap-accent)]/10 ring-1 ring-[var(--ap-accent)]/20">
                <span class="text-xs font-bold text-[var(--ap-accent)]">{{ getInitials(member.full_name) }}</span>
              </div>

              <!-- Info -->
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium text-highlighted">{{ member.full_name }}</p>
                <div class="mt-0.5 flex items-center gap-1.5">
                  <span v-if="member.email" class="truncate text-xs text-muted">{{ member.email }}</span>
                  <span v-if="member.phone" class="inline-flex shrink-0 items-center rounded bg-black/[0.03] px-1.5 py-0.5 text-[10px] text-muted dark:bg-white/[0.06]">{{ member.phone }}</span>
                </div>
              </div>

              <!-- Badges -->
              <span class="hidden shrink-0 rounded-md border border-[var(--ap-accent)]/55 bg-[var(--ap-accent)]/20 px-2 py-0.5 text-[11px] font-medium text-white sm:inline-flex">
                {{ positionLabel(member.position, member.position_other) }}
              </span>
              <span class="hidden shrink-0 rounded-md bg-black px-2 py-0.5 text-[11px] font-medium text-white md:inline-flex dark:bg-white/90 dark:text-black">
                {{ shiftLabel(member.shift_availability) }}
              </span>

              <!-- Actions -->
              <div class="flex shrink-0 items-center gap-0.5">
                <UButton icon="i-lucide-pencil" size="xs" color="neutral" variant="ghost" @click="openEdit(member)" />
                <UButton icon="i-lucide-trash-2" size="xs" variant="ghost" class="text-red-400 hover:text-red-300" :loading="deleting === member.id" @click="confirmDelete(member)" />
              </div>
            </div>

            <!-- ── Inline Edit Row ── -->
            <div
              v-else
              class="border-l-2 border-[var(--ap-accent)]/60 bg-[var(--ap-accent)]/[0.03] px-4 py-4 sm:px-5"
            >
              <div class="space-y-3">
                <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div class="space-y-1.5">
                    <label class="text-xs font-medium text-highlighted">Full Name <span class="text-red-400/80">*</span></label>
                    <UInput v-model="editForm.full_name" size="sm" placeholder="Jane Smith" autocomplete="off" class="w-full" />
                  </div>
                  <div class="space-y-1.5">
                    <label class="text-xs font-medium text-highlighted">Email</label>
                    <UInput v-model="editForm.email" size="sm" type="email" placeholder="jane@example.com" autocomplete="off" class="w-full" />
                  </div>
                  <div class="space-y-1.5">
                    <label class="text-xs font-medium text-highlighted">Phone</label>
                    <UInput v-model="editForm.phone" size="sm" type="tel" placeholder="+1 (555) 000-0000" autocomplete="off" class="w-full" />
                  </div>
                </div>
                <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div class="space-y-1.5">
                    <label class="text-xs font-medium text-highlighted">Position <span class="text-red-400/80">*</span></label>
                    <USelect v-model="editForm.position" size="sm" :items="POSITION_OPTIONS" value-key="value" label-key="label" placeholder="Select position" class="w-full" />
                  </div>
                  <div v-if="editForm.position === 'other'" class="space-y-1.5">
                    <label class="text-xs font-medium text-highlighted">Specify Position <span class="text-red-400/80">*</span></label>
                    <UInput v-model="editForm.position_other" size="sm" placeholder="e.g., Quality Assurance" autocomplete="off" class="w-full" />
                  </div>
                  <div class="space-y-1.5">
                    <label class="text-xs font-medium text-highlighted">Shift Availability <span class="text-red-400/80">*</span></label>
                    <USelect v-model="editForm.shift_availability" size="sm" :items="SHIFT_OPTIONS" value-key="value" label-key="label" placeholder="Select shift" class="w-full" />
                  </div>
                </div>
                <div class="flex items-center justify-end gap-2 pt-1">
                  <UButton label="Cancel" size="xs" color="neutral" variant="ghost" :disabled="saving" @click="cancelEdit" />
                  <UButton size="xs" :loading="saving" @click="saveEdit">
                    <template #leading>
                      <UIcon name="i-lucide-check" class="text-xs" />
                    </template>
                    Save Member
                  </UButton>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

  </div>

  <!-- ═══ Add Member Modal ══════════════════════════════════════════════ -->
  <UModal v-model:open="addModal" title="Add Team Member">
    <template #body>
      <div class="space-y-4 p-1">
        <!-- Row 1 -->
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div class="space-y-1.5">
            <label class="text-xs font-medium text-highlighted">Full Name <span class="text-red-400/80">*</span></label>
            <UInput v-model="form.full_name" size="sm" placeholder="Jane Smith" autocomplete="off" class="w-full" />
          </div>
          <div class="space-y-1.5">
            <label class="text-xs font-medium text-highlighted">Email</label>
            <UInput v-model="form.email" size="sm" type="email" placeholder="jane@example.com" autocomplete="off" class="w-full" />
          </div>
        </div>
        <!-- Row 2 -->
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div class="space-y-1.5">
            <label class="text-xs font-medium text-highlighted">Phone</label>
            <UInput v-model="form.phone" size="sm" type="tel" placeholder="+1 (555) 000-0000" autocomplete="off" class="w-full" />
          </div>
          <div class="space-y-1.5">
            <label class="text-xs font-medium text-highlighted">Position <span class="text-red-400/80">*</span></label>
            <USelect v-model="form.position" size="sm" :items="POSITION_OPTIONS" value-key="value" label-key="label" placeholder="Select position" class="w-full" />
          </div>
        </div>
        <!-- Row 3 -->
        <div class="grid gap-3" :class="form.position === 'other' ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'">
          <div v-if="form.position === 'other'" class="space-y-1.5">
            <label class="text-xs font-medium text-highlighted">Specify Position <span class="text-red-400/80">*</span></label>
            <UInput v-model="form.position_other" size="sm" placeholder="e.g., Quality Assurance" autocomplete="off" class="w-full" />
          </div>
          <div class="space-y-1.5">
            <label class="text-xs font-medium text-highlighted">Shift Availability <span class="text-red-400/80">*</span></label>
            <USelect v-model="form.shift_availability" size="sm" :items="SHIFT_OPTIONS" value-key="value" label-key="label" placeholder="Select shift" class="w-full" />
          </div>
        </div>
      </div>
    </template>
    <template #footer>
      <div class="flex items-center justify-between gap-3">
        <p class="hidden text-[11px] text-muted sm:block">Fields marked with <span class="text-red-400/80">*</span> are required</p>
        <div class="flex items-center gap-2">
          <UButton label="Cancel" size="sm" color="neutral" variant="ghost" :disabled="saving" @click="addModal = false; resetForm()" />
          <UButton size="sm" :loading="saving" @click="addMember">
            <template #leading>
              <UIcon name="i-lucide-plus" class="text-xs" />
            </template>
            Add Member
          </UButton>
        </div>
      </div>
    </template>
  </UModal>

  <!-- ═══ Delete Confirmation Modal ═════════════════════════════════════ -->
  <UModal v-model:open="deleteModal" title="Remove Team Member" :dismissible="false">
    <template #body>
      <div class="p-1">
        <p class="text-sm text-muted">
          Are you sure you want to remove <span class="font-medium text-highlighted">{{ deleteTarget?.full_name }}</span>? This action cannot be undone.
        </p>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton label="Cancel" color="neutral" variant="ghost" @click="deleteModal = false" />
        <UButton label="Remove" color="error" :loading="deleting === deleteTarget?.id" @click="executeDelete" />
      </div>
    </template>
  </UModal>
</template>
