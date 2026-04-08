<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { formatTimeAgo } from '@vueuse/core'
import { useNotifications } from '../composables/useNotifications'
import type { AppNotification, NotificationCategory } from '../types'

const router = useRouter()
const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications()

const isOpen = ref(false)
const expandedLeadIds = ref<string[]>([])

const categoryConfig: Record<NotificationCategory, { icon: string; iconClass: string; bgClass: string }> = {
  new_lead:         { icon: 'i-lucide-sparkles',         iconClass: 'text-primary',      bgClass: 'bg-primary/10' },
  lead_assigned:    { icon: 'i-lucide-user-plus',        iconClass: 'text-green-400',    bgClass: 'bg-green-400/10' },
  stage_updated:    { icon: 'i-lucide-trending-up',      iconClass: 'text-blue-400',     bgClass: 'bg-blue-400/10' },
  pipeline_changed: { icon: 'i-lucide-arrow-left-right', iconClass: 'text-[--ap-amber]', bgClass: 'bg-[--ap-amber-soft]' },
  note_added:       { icon: 'i-lucide-message-square',   iconClass: 'text-zinc-400',     bgClass: 'bg-zinc-500/10' },
}

interface NotificationGroup {
  key: string
  lead_id: string | null
  lead_name: string | null
  items: AppNotification[]
  groupUnreadCount: number
  latestAt: string
}

const grouped = computed((): NotificationGroup[] => {
  const map = new Map<string, NotificationGroup>()

  for (const n of notifications.value) {
    const key = n.lead_id ?? `_ungrouped_${n.id}`

    if (!map.has(key)) {
      map.set(key, {
        key,
        lead_id: n.lead_id,
        lead_name: n.lead_name ?? null,
        items: [],
        groupUnreadCount: 0,
        latestAt: n.created_at,
      })
    }

    const group = map.get(key)!
    group.items.push(n)
    if (!n.is_read) group.groupUnreadCount++
    if (n.created_at > group.latestAt) group.latestAt = n.created_at
  }

  return Array.from(map.values())
    .sort((a, b) => new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime())
    .slice(0, 8)
})

const isExpanded = (key: string) => expandedLeadIds.value.includes(key)

const toggleGroup = (key: string) => {
  const idx = expandedLeadIds.value.indexOf(key)
  if (idx === -1) expandedLeadIds.value.push(key)
  else expandedLeadIds.value.splice(idx, 1)
}

const handleNotificationClick = async (n: AppNotification) => {
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
      <div class="w-104 max-h-136 flex flex-col overflow-hidden rounded-xl">

        <!-- Header -->
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

        <!-- Groups -->
        <div class="max-h-112 overflow-y-auto overscroll-contain">
          <div v-if="grouped.length === 0" class="px-4 py-10 text-center text-sm text-muted">
            No notifications yet
          </div>

          <div
            v-for="group in grouped"
            :key="group.key"
            class="border-b border-default last:border-b-0"
          >
            <!-- Group header row -->
            <button
              class="w-full text-left px-4 py-2.5 flex items-center gap-2.5 hover:bg-elevated/50 transition-colors relative"
              :class="{ 'bg-elevated/25': group.groupUnreadCount > 0 }"
              @click="toggleGroup(group.key)"
            >
              <span
                v-if="group.groupUnreadCount > 0"
                class="absolute left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-primary shrink-0"
              />

              <div class="shrink-0 w-7 h-7 rounded-full bg-zinc-500/10 flex items-center justify-center">
                <UIcon name="i-lucide-folder-open" class="w-3.5 h-3.5 text-zinc-400" />
              </div>

              <div class="flex-1 min-w-0">
                <p class="text-xs font-semibold text-highlighted truncate">
                  {{ group.lead_name ? `Opportunity: ${group.lead_name}` : 'General' }}
                </p>
                <p class="text-[11px] text-muted mt-0.5">
                  {{ group.items.length }} notification{{ group.items.length !== 1 ? 's' : '' }}
                </p>
              </div>

              <span
                v-if="group.groupUnreadCount > 0"
                class="shrink-0 flex items-center justify-center min-w-4.5 h-4.5 rounded-full bg-primary/15 text-primary text-[10px] font-bold px-1"
              >
                {{ group.groupUnreadCount }}
              </span>

              <UIcon
                :name="isExpanded(group.key) ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                class="w-3.5 h-3.5 text-muted shrink-0"
              />
            </button>

            <!-- Expanded: individual notifications -->
            <div v-if="isExpanded(group.key)">
              <button
                v-for="n in group.items"
                :key="n.id"
                class="w-full text-left pl-8 pr-4 py-2.5 flex items-start gap-2.5 hover:bg-elevated/30 transition-colors relative border-t border-default/50"
                :class="{ 'bg-elevated/10': !n.is_read }"
                @click="handleNotificationClick(n)"
              >
                <span
                  v-if="!n.is_read"
                  class="absolute left-3 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-primary shrink-0"
                />

                <div
                  class="shrink-0 w-7 h-7 rounded-full flex items-center justify-center"
                  :class="categoryConfig[n.category].bgClass"
                >
                  <UIcon
                    :name="categoryConfig[n.category].icon"
                    class="w-3.5 h-3.5"
                    :class="categoryConfig[n.category].iconClass"
                  />
                </div>

                <div class="flex-1 min-w-0">
                  <p class="text-xs font-medium text-highlighted truncate">{{ n.title }}</p>
                  <p class="text-[11px] text-dimmed mt-0.5 line-clamp-1">{{ n.description }}</p>
                  <time class="text-[11px] text-muted mt-0.5 block">
                    {{ formatTimeAgo(new Date(n.created_at)) }}
                  </time>
                </div>
              </button>
            </div>

          </div>
        </div>

        <!-- Footer -->
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
