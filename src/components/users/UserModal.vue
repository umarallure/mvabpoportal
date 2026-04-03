<script setup lang="ts">
import { computed, onMounted, onUpdated, ref } from 'vue'
import type { ManageUserRole, ManageUserRow } from '../../lib/manage-users'

const props = defineProps<{
  open: boolean
  user?: ManageUserRow | null
  loading?: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'after:leave': []
  'submit': [
    payload:
      | { mode: 'create'; email: string; password: string; role: ManageUserRole | null }
      | { mode: 'edit'; user_id: string; role: ManageUserRole | null }
  ]
}>()

const NO_ROLE = '__none__' as const

const email = ref('')
const password = ref('')
const role = ref<ManageUserRole | typeof NO_ROLE>(NO_ROLE)

const roleOptions = [
  { value: NO_ROLE, label: 'No role' },
  { value: 'super_admin', label: 'Super admin' },
  { value: 'admin', label: 'Admin' },
  { value: 'lawyer', label: 'Lawyer' },
  { value: 'agent', label: 'Agent' }
]

const isEditMode = computed(() => Boolean(props.user))

const resetForm = () => {
  email.value = ''
  password.value = ''
  role.value = NO_ROLE
}

const setFromUser = (user: ManageUserRow) => {
  email.value = user.email
  password.value = ''
  role.value = (user.role ?? NO_ROLE) as ManageUserRole | typeof NO_ROLE
}

const previousOpen = ref(props.open)

const syncOpenState = () => {
  if (props.open !== previousOpen.value) {
    if (props.open) {
      if (props.user) {
        setFromUser(props.user)
      } else {
        resetForm()
      }
    } else {
      resetForm()
    }
    previousOpen.value = props.open
  }
}

onMounted(syncOpenState)
onUpdated(syncOpenState)

const canSubmit = () => {
  if (isEditMode.value) return Boolean(props.user?.user_id)
  return email.value.trim() !== '' && password.value.trim() !== ''
}

const handleClose = () => {
  resetForm()
  emit('update:open', false)
}

const handleSubmit = () => {
  if (isEditMode.value) {
    if (!props.user) return
    emit('submit', {
      mode: 'edit',
      user_id: props.user.user_id,
      role: role.value === NO_ROLE ? null : (role.value as ManageUserRole)
    })
    return
  }

  if (!canSubmit()) return
  emit('submit', {
    mode: 'create',
    email: email.value.trim(),
    password: password.value,
    role: role.value === NO_ROLE ? null : (role.value as ManageUserRole)
  })
}

const handleUpdateOpen = (value: boolean) => {
  if (!value) {
    resetForm()
  }
  emit('update:open', value)
}
</script>

<template>
  <UModal
    :open="props.open"
    :title="isEditMode ? 'Edit user' : 'Add user'"
    :dismissible="false"
    @update:open="handleUpdateOpen"
    @after:leave="emit('after:leave')"
  >
    <template #body>
      <div class="space-y-4">
        <UFormField label="Email">
          <UInput
            v-model="email"
            placeholder="user@accidentpayments.com"
            :disabled="isEditMode"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
          />
        </UFormField>

        <UFormField v-if="!isEditMode" label="Password">
          <UInput
            v-model="password"
            type="password"
            placeholder="••••••••"
            autocomplete="new-password"
          />
        </UFormField>

        <UFormField label="Role">
          <USelect
            v-model="role"
            :items="roleOptions"
            value-key="value"
            label-key="label"
          />
        </UFormField>

        <div class="flex justify-end gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            :disabled="props.loading"
            @click="handleClose"
          >
            Cancel
          </UButton>
          <UButton
            :disabled="props.loading || !canSubmit()"
            @click="handleSubmit"
          >
            {{ isEditMode ? 'Save' : 'Create' }}
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
