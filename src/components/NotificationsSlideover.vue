<script setup lang="ts">
import { formatTimeAgo } from '@vueuse/core'
import { useRouter } from 'vue-router'
import { useDashboard } from '../composables/useDashboard'
import { useNotifications } from '../composables/useNotifications'

const router = useRouter()
const { isNotificationsSlideoverOpen } = useDashboard()
const { notifications, markAsRead } = useNotifications()

const handleClick = async (id: string, redirectUrl: string | null, isRead: boolean) => {
  isNotificationsSlideoverOpen.value = false
  if (!isRead) await markAsRead(id)
  if (redirectUrl) router.push(redirectUrl)
}
</script>

<template>
  <USlideover
    v-model:open="isNotificationsSlideoverOpen"
    title="Notifications"
  >
    <template #body>
      <div v-if="notifications.length === 0" class="py-10 text-center text-sm text-muted">
        No notifications yet
      </div>

      <button
        v-for="n in notifications"
        :key="n.id"
        class="w-full text-left px-3 py-2.5 rounded-md hover:bg-elevated/50 flex items-center gap-3 relative -mx-3"
        :class="{ 'bg-elevated/25': !n.is_read }"
        @click="handleClick(n.id, n.redirect_url, n.is_read)"
      >
        <span
          v-if="!n.is_read"
          class="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-primary shrink-0"
        />

        <div class="text-sm flex-1 min-w-0">
          <p class="flex items-center justify-between gap-2">
            <span class="text-highlighted font-medium truncate">{{ n.title }}</span>
            <time
              :datetime="n.created_at"
              class="text-muted text-xs shrink-0"
            >
              {{ formatTimeAgo(new Date(n.created_at)) }}
            </time>
          </p>
          <p class="text-dimmed line-clamp-2 mt-0.5">{{ n.description }}</p>
        </div>
      </button>
    </template>
  </USlideover>
</template>
