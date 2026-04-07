<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useAuth } from '../../composables/useAuth'
import { supabase } from '../../lib/supabase'

interface TeamMember {
  id: string
  lawyer_id: string
  publisher_id: string | null
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

const editModal = ref(false)
const editTarget = ref<TeamMember | null>(null)

const ownerUserId = computed(() => auth.state.value.user?.id ?? '')

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
const editForm = reactive({ ...emptyForm(), id: '' })

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

const loadMembers = async () => {
  if (!ownerUserId.value) return
  loading.value = true
  try {
    const { data, error } = await supabase
      .from('team_members')
      .select('*')
      .or(`publisher_id.eq.${ownerUserId.value},lawyer_id.eq.${ownerUserId.value}`)
      .order('full_name', { ascending: true })

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
      publisher_id: ownerUserId.value,
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
  editTarget.value = member
  Object.assign(editForm, {
    id: member.id,
    full_name: member.full_name,
    email: member.email ?? '',
    phone: member.phone ?? '',
    position: member.position,
    position_other: member.position_other ?? '',
    shift_availability: member.shift_availability
  })
  editModal.value = true
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

    const { error } = await supabase
      .from('team_members')
      .update(payload)
      .eq('id', editForm.id)

    if (error) throw error

    toast.add({
      title: 'Member updated',
      description: `${payload.full_name} has been updated.`,
      icon: 'i-lucide-check',
      color: 'success'
    })

    editModal.value = false
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

const deleteMember = async (member: TeamMember) => {
  deleting.value = member.id
  try {
    const { error } = await supabase
      .from('team_members')
      .delete()
      .eq('id', member.id)

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
  }
}

onMounted(async () => {
  await auth.init()
  await loadMembers()
})
</script>

<template>
  <!-- Add Member Form -->
  <UPageCard
    title="Team Profile"
    description="Add and manage the members of your BPO team."
    variant="naked"
    orientation="horizontal"
    class="mb-4"
  />

  <UPageCard variant="subtle" class="mb-6">
    <div class="space-y-6">
      <h3 class="text-lg font-semibold">
        Add Team Member
      </h3>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <UFormField label="Full Name" required>
          <UInput
            v-model="form.full_name"
            placeholder="Jane Smith"
            autocomplete="name"
          />
        </UFormField>

        <UFormField label="Email">
          <UInput
            v-model="form.email"
            type="email"
            placeholder="jane@example.com"
            autocomplete="email"
          />
        </UFormField>

        <UFormField label="Phone">
          <UInput
            v-model="form.phone"
            placeholder="+1 (555) 000-0000"
            autocomplete="tel"
          />
        </UFormField>

        <UFormField label="Position" required>
          <USelect
            v-model="form.position"
            :items="POSITION_OPTIONS"
            value-key="value"
            label-key="label"
            placeholder="Select position"
          />
        </UFormField>

        <UFormField v-if="form.position === 'other'" label="Position (describe)">
          <UInput
            v-model="form.position_other"
            placeholder="e.g., Quality Assurance"
          />
        </UFormField>

        <UFormField label="Shift Availability" required>
          <USelect
            v-model="form.shift_availability"
            :items="SHIFT_OPTIONS"
            value-key="value"
            label-key="label"
            placeholder="Select shift"
          />
        </UFormField>
      </div>

      <div class="flex justify-end">
        <UButton
          label="Add Member"
          icon="i-lucide-user-plus"
          color="neutral"
          :loading="saving"
          @click="addMember"
        />
      </div>
    </div>
  </UPageCard>

  <!-- Members List -->
  <UPageCard variant="subtle">
    <div class="space-y-4">
      <h3 class="text-lg font-semibold">
        Team Members
      </h3>

      <div v-if="loading" class="space-y-3">
        <USkeleton v-for="i in 3" :key="i" class="h-16 w-full rounded-xl" />
      </div>

      <div v-else-if="members.length === 0" class="flex flex-col items-center gap-3 py-10 text-center">
        <UIcon name="i-lucide-users" class="size-10 text-muted" />
        <p class="text-sm text-muted">No team members yet. Add one above.</p>
      </div>

      <div v-else class="divide-y divide-default">
        <div
          v-for="member in members"
          :key="member.id"
          class="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0"
        >
          <div class="flex items-center gap-3 min-w-0">
            <div class="flex size-9 shrink-0 items-center justify-center rounded-full bg-elevated">
              <UIcon name="i-lucide-user" class="size-4 text-muted" />
            </div>
            <div class="min-w-0">
              <p class="truncate text-sm font-medium">{{ member.full_name }}</p>
              <p class="truncate text-xs text-muted">
                {{ positionLabel(member.position, member.position_other) }}
                &middot;
                {{ shiftLabel(member.shift_availability) }}
                <template v-if="member.email">
                  &middot; {{ member.email }}
                </template>
              </p>
            </div>
          </div>

          <div class="flex shrink-0 items-center gap-2">
            <UButton
              icon="i-lucide-pencil"
              size="sm"
              color="neutral"
              variant="ghost"
              @click="openEdit(member)"
            />
            <UButton
              icon="i-lucide-trash-2"
              size="sm"
              color="error"
              variant="ghost"
              :loading="deleting === member.id"
              @click="deleteMember(member)"
            />
          </div>
        </div>
      </div>
    </div>
  </UPageCard>

  <!-- Edit Modal -->
  <UModal v-model:open="editModal" title="Edit Team Member">
    <template #body>
      <div class="space-y-4 p-1">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <UFormField label="Full Name" required>
            <UInput v-model="editForm.full_name" placeholder="Jane Smith" />
          </UFormField>

          <UFormField label="Email">
            <UInput v-model="editForm.email" type="email" placeholder="jane@example.com" />
          </UFormField>

          <UFormField label="Phone">
            <UInput v-model="editForm.phone" placeholder="+1 (555) 000-0000" />
          </UFormField>

          <UFormField label="Position" required>
            <USelect
              v-model="editForm.position"
              :items="POSITION_OPTIONS"
              value-key="value"
              label-key="label"
              placeholder="Select position"
            />
          </UFormField>

          <UFormField v-if="editForm.position === 'other'" label="Position (describe)">
            <UInput v-model="editForm.position_other" placeholder="e.g., Quality Assurance" />
          </UFormField>

          <UFormField label="Shift Availability" required>
            <USelect
              v-model="editForm.shift_availability"
              :items="SHIFT_OPTIONS"
              value-key="value"
              label-key="label"
              placeholder="Select shift"
            />
          </UFormField>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton
          label="Cancel"
          color="neutral"
          variant="ghost"
          :disabled="saving"
          @click="editModal = false"
        />
        <UButton
          label="Save changes"
          color="neutral"
          :loading="saving"
          @click="saveEdit"
        />
      </div>
    </template>
  </UModal>
</template>
