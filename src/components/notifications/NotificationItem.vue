<script setup lang="ts">
import { computed, ref } from 'vue'
import { formatTimeAgo } from '@vueuse/core'
import type { AppNotification } from '../../types'
import {
  getNotificationMessage,
  getNotificationMeta,
  getNotificationPreview
} from '../../lib/notifications'

const props = withDefaults(defineProps<{
  notification: AppNotification
  compact?: boolean
  index?: number
}>(), {
  compact: false,
  index: 0
})

const emit = defineEmits<{
  select: [notification: AppNotification]
  delete: [notification: AppNotification]
  'mark-read': [notification: AppNotification]
}>()

const meta = computed(() => getNotificationMeta(props.notification.category))
const preview = computed(() => getNotificationMessage(props.notification) || getNotificationPreview(props.notification))
const relativeTime = computed(() => formatTimeAgo(new Date(props.notification.created_at)))
const rowHoverBg = computed(() => `color-mix(in srgb, ${meta.value.accent} 10%, transparent)`)

const menuOpen = ref(false)

const handleSelect = () => {
  emit('select', props.notification)
}

const handleDelete = () => {
  menuOpen.value = false
  emit('delete', props.notification)
}

const handleMarkRead = () => {
  menuOpen.value = false
  emit('mark-read', props.notification)
}

const animDelay = computed(() => `${Math.min(props.index * 40, 400)}ms`)
</script>

<template>
  <div
    class="notification-row"
    :style="{ animationDelay: animDelay, '--notification-hover-bg': rowHoverBg, '--notification-accent': meta.accent }"
    :data-unread="!notification.is_read"
  >
    <button
      type="button"
      class="notification-row__button group flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors sm:px-5"
      @click="handleSelect"
    >
      <!-- Unread dot -->
      <span
        v-if="!notification.is_read"
        class="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full"
        :style="{ background: meta.accent }"
      />
      <span v-else class="mt-2.5 h-1.5 w-1.5 shrink-0" />

      <!-- Icon -->
      <div
        class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
        :style="{ background: meta.iconBg, color: meta.accent }"
      >
        <UIcon :name="meta.icon" class="size-3.5" />
      </div>

      <!-- Content -->
      <div class="min-w-0 flex-1 pr-8 sm:pr-10">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <div class="notification-row__meta flex items-start justify-between gap-3">
              <span
                class="rounded-md px-1.5 py-0.5 text-[10px] font-semibold leading-none"
                :style="{ background: meta.iconBg, color: meta.accent }"
              >{{ meta.label }}</span>
              <time :datetime="notification.created_at" class="notification-row__time text-[10px] text-muted">{{ relativeTime }}</time>
            </div>
            <p class="mt-1 text-[13px] font-medium leading-snug text-highlighted" :class="{ 'font-semibold': !notification.is_read }">
              {{ notification.title }}
            </p>
          </div>
        </div>
        <p class="mt-0.5 text-xs leading-relaxed text-muted line-clamp-2">{{ preview }}</p>
      </div>
    </button>

    <!-- 3-dot menu -->
    <div class="absolute right-3 top-3.5 sm:right-4">
      <UPopover v-model:open="menuOpen" :popper="{ placement: 'bottom-end' }">
        <UButton
          icon="i-lucide-ellipsis"
          size="xs"
          color="neutral"
          variant="ghost"
          class="opacity-0 transition-opacity group-hover:opacity-100"
          :class="{ '!opacity-100': menuOpen }"
          @click.stop
        />
        <template #content>
          <div class="w-40 py-1">
            <button
              v-if="!notification.is_read"
              type="button"
              class="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-highlighted transition-colors hover:bg-[var(--ap-accent)]/[0.06]"
              @click.stop="handleMarkRead"
            >
              <UIcon name="i-lucide-check" class="size-3.5 text-muted" />
              Mark as read
            </button>
            <button
              type="button"
              class="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-red-400 transition-colors hover:bg-red-500/[0.06]"
              @click.stop="handleDelete"
            >
              <UIcon name="i-lucide-trash-2" class="size-3.5" />
              Delete
            </button>
          </div>
        </template>
      </UPopover>
    </div>
  </div>
</template>

<style scoped>
.notification-row {
  position: relative;
  animation: notification-fade-up 0.4s cubic-bezier(0.16, 1, 0.3, 1) both;
  scroll-margin-top: 1rem;
}

.notification-row__button {
  transition: background-color 180ms ease;
}

.notification-row:hover .notification-row__button {
  background: var(--notification-hover-bg);
}

.notification-row[data-selected="true"] .notification-row__button {
  background: var(--notification-hover-bg);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--notification-accent) 26%, transparent);
}

.notification-row__time {
  flex-shrink: 0;
  text-align: right;
  white-space: nowrap;
}

@keyframes notification-fade-up {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Make the 3-dot button visible on row hover */
.notification-row:hover :deep(.opacity-0) {
  opacity: 1;
}
</style>
