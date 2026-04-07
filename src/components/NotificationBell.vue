<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { formatTimeAgo } from '@vueuse/core'
import { useNotifications } from '../composables/useNotifications'
import type { AppNotification, NotificationCategory } from '../types'

const router = useRouter()
const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications()

const isOpen = ref(false)

const recent = computed(() => notifications.value.slice(0, 10))

const categoryConfig: Record<NotificationCategory, { icon: string; iconClass: string; bgClass: string }> = {
  new_lead:         { icon: 'i-lucide-sparkles',         iconClass: 'text-primary',      bgClass: 'bg-primary/10' },
  lead_assigned:    { icon: 'i-lucide-user-plus',        iconClass: 'text-green-400',    bgClass: 'bg-green-400/10' },
  stage_updated:    { icon: 'i-lucide-trending-up',      iconClass: 'text-blue-400',     bgClass: 'bg-blue-400/10' },
  pipeline_changed: { icon: 'i-lucide-arrow-left-right', iconClass: 'text-[--ap-amber]', bgClass: 'bg-[--ap-amber-soft]' },
  note_added:       { icon: 'i-lucide-message-square',   iconClass: 'text-zinc-400',     bgClass: 'bg-zinc-500/10' },
}

const handleClick = async (n: AppNotification) => {
  isOpen.value = false
  if (!n.is_read) await markAsRead(n.id)
  if (n.redirect_url) router.push(n.redirect_url)
}

const handleMarkAll = async () => {
  await markAllAsRead()
}

const handleShowAll = () => {
  isOpen.value = false
  router.push('/notifications')
}
</script>

<template>
  <UPopover v-model:open="isOpen" :content="{ side: 'bottom', align: 'end' }">
    <UButton
      variant="ghost"
      color="neutral"
      :icon="unreadCount > 0 ? 'i-lucide-bell-ring' : 'i-lucide-bell'"
      aria-label="Notifications"
      class="relative"
    >
      <span
        v-if="unreadCount > 0"
        class="absolute -top-1 -right-1 flex items-center justify-center min-w-4.5 h-4.5 rounded-full bg-red-500 text-white text-[10px] font-bold px-1 leading-none pointer-events-none"
      >
        {{ unreadCount > 99 ? '99+' : unreadCount }}
      </span>
    </UButton>

    <template #content>
      <div class="w-[26rem] max-h-[34rem] flex flex-col overflow-hidden rounded-xl">
        <div class="px-4 py-3 border-b border-default flex items-center justify-between shrink-0">
          <span class="text-sm font-semibold text-highlighted">Notifications</span>
          <button
            v-if="unreadCount > 0"
            class="text-xs text-primary hover:underline"
            @click="handleMarkAll"
          >
            Mark all as read
          </button>
        </div>

        <div class="max-h-[28rem] overflow-y-auto overscroll-contain">
          <div v-if="notifications.length === 0" class="px-4 py-10 text-center text-sm text-muted">
            No notifications yet
          </div>

          <button
            v-for="n in recent"
            :key="n.id"
            class="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-elevated/50 transition-colors relative border-b border-default last:border-b-0"
            :class="{ 'bg-elevated/25': !n.is_read }"
            @click="handleClick(n)"
          >
            <span
              v-if="!n.is_read"
              class="absolute left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-primary shrink-0"
            />

            <div
              class="shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
              :class="categoryConfig[n.category].bgClass"
            >
              <UIcon
                :name="categoryConfig[n.category].icon"
                class="w-4 h-4"
                :class="categoryConfig[n.category].iconClass"
              />
            </div>

            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-highlighted truncate">{{ n.title }}</p>
              <p class="text-xs text-dimmed mt-0.5 line-clamp-2">{{ n.description }}</p>
              <time class="text-xs text-muted mt-1 block">
                {{ formatTimeAgo(new Date(n.created_at)) }}
              </time>
            </div>
          </button>
        </div>

        <div class="border-t border-default shrink-0">
          <button
            class="w-full py-2.5 text-xs text-center text-primary hover:bg-elevated/50 transition-colors"
            @click="handleShowAll"
          >
            Show all notifications
          </button>
        </div>
      </div>
    </template>
  </UPopover>
</template>
