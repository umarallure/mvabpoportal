<script setup lang="ts">
import { useRouter } from 'vue-router'
import { formatTimeAgo } from '@vueuse/core'
import { useNotifications } from '../composables/useNotifications'
import type { AppNotification, NotificationCategory } from '../types'

const router = useRouter()
const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications()

const categoryConfig: Record<NotificationCategory, { icon: string; iconClass: string; bgClass: string; label: string }> = {
  new_lead:         { icon: 'i-lucide-sparkles',         iconClass: 'text-primary',      bgClass: 'bg-primary/10',      label: 'New Lead' },
  lead_assigned:    { icon: 'i-lucide-user-plus',        iconClass: 'text-green-400',    bgClass: 'bg-green-400/10',    label: 'Lead Assigned' },
  stage_updated:    { icon: 'i-lucide-trending-up',      iconClass: 'text-blue-400',     bgClass: 'bg-blue-400/10',     label: 'Stage Updated' },
  pipeline_changed: { icon: 'i-lucide-arrow-left-right', iconClass: 'text-[--ap-amber]', bgClass: 'bg-[--ap-amber-soft]', label: 'Pipeline Changed' },
  note_added:       { icon: 'i-lucide-message-square',   iconClass: 'text-zinc-400',     bgClass: 'bg-zinc-500/10',     label: 'Note Added' },
}

const handleClick = async (n: AppNotification) => {
  if (!n.is_read) await markAsRead(n.id)
  if (n.redirect_url) router.push(n.redirect_url)
}
</script>

<template>
  <UDashboardPanel id="notifications">
    <template #header>
      <UDashboardNavbar title="Notifications">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            v-if="unreadCount > 0"
            color="neutral"
            variant="outline"
            size="sm"
            @click="markAllAsRead"
          >
            Mark all as read
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="max-w-2xl mx-auto py-4">
        <div v-if="notifications.length === 0" class="py-20 text-center text-muted text-sm">
          No notifications yet
        </div>

        <div v-else class="flex flex-col divide-y divide-default">
          <button
            v-for="n in notifications"
            :key="n.id"
            class="w-full text-left px-4 py-4 flex items-start gap-4 hover:bg-elevated/40 transition-colors relative"
            :class="{ 'bg-elevated/20': !n.is_read }"
            @click="handleClick(n)"
          >
            <span
              v-if="!n.is_read"
              class="absolute left-1 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-primary shrink-0"
            />

            <div
              class="shrink-0 w-10 h-10 rounded-full flex items-center justify-center"
              :class="categoryConfig[n.category].bgClass"
            >
              <UIcon
                :name="categoryConfig[n.category].icon"
                class="w-5 h-5"
                :class="categoryConfig[n.category].iconClass"
              />
            </div>

            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 justify-between">
                <p class="text-sm font-medium text-highlighted">{{ n.title }}</p>
                <time class="text-xs text-muted shrink-0">
                  {{ formatTimeAgo(new Date(n.created_at)) }}
                </time>
              </div>
              <p class="text-sm text-dimmed mt-0.5">{{ n.description }}</p>
              <span class="inline-block mt-1.5 text-xs px-2 py-0.5 rounded-full bg-elevated text-muted">
                {{ categoryConfig[n.category].label }}
              </span>
            </div>
          </button>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
