<script setup lang="ts">
import type { ManageUserRow } from '../../lib/manage-users'

const props = defineProps<{
  open: boolean
  user: ManageUserRow | null
  loading?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'confirm'): void
}>()

const handleUpdateOpen = (value: boolean) => {
  emit('update:open', value)
}
</script>

<template>
  <UModal :open="props.open" title="Delete user" :dismissible="false" @update:open="handleUpdateOpen">
    <template #body>
      <div class="space-y-4">
        <p class="text-sm text-white/80">
          This will delete the user from Supabase Auth and remove their profile.
        </p>

        <UAlert
          v-if="props.user"
          color="warning"
          variant="subtle"
          title="You are deleting"
          :description="props.user.email"
        />

        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" :disabled="props.loading" @click="() => emit('update:open', false)">
            Cancel
          </UButton>
          <UButton color="error" :disabled="props.loading" @click="emit('confirm')">
            Delete
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
