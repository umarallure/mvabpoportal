<script setup lang="ts">
import { computed } from 'vue'
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
}>(), {
  compact: false
})

const emit = defineEmits<{
  select: [notification: AppNotification]
}>()

const meta = computed(() => getNotificationMeta(props.notification.category))
const preview = computed(() => getNotificationMessage(props.notification) || getNotificationPreview(props.notification))
const relativeTime = computed(() => formatTimeAgo(new Date(props.notification.created_at)))

const themeVars = computed(() => ({
  '--notification-accent': meta.value.accent,
  '--notification-icon-bg': meta.value.iconBg
}))

const handleSelect = () => {
  emit('select', props.notification)
}
</script>

<template>
  <button
    type="button"
    class="notification-item"
    :data-compact="compact"
    :data-unread="!notification.is_read"
    :style="themeVars"
    @click="handleSelect"
  >
    <span v-if="!notification.is_read" class="notification-item__dot" />

    <div class="notification-item__icon">
      <UIcon :name="meta.icon" class="h-4 w-4" />
    </div>

    <div class="min-w-0 flex-1">
      <div class="notification-item__header">
        <div class="min-w-0">
          <div class="notification-item__badges">
            <span class="notification-item__badge">{{ meta.label }}</span>
          </div>

          <p class="notification-item__title">
            {{ notification.title }}
          </p>
        </div>

        <time :datetime="notification.created_at" class="notification-item__time">
          {{ relativeTime }}
        </time>
      </div>

      <p class="notification-item__preview">
        {{ preview }}
      </p>
    </div>
  </button>
</template>

<style scoped>
.notification-item {
  position: relative;
  display: flex;
  width: 100%;
  align-items: flex-start;
  gap: 0.9rem;
  border: 1px solid var(--dashboard-surface-border);
  border-radius: 1rem;
  background: var(--dashboard-surface);
  color: inherit;
  cursor: pointer;
  font: inherit;
  padding: 1rem;
  text-align: left;
  transition: border-color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
}

.notification-item:hover {
  border-color: var(--dashboard-surface-border-strong);
  background: color-mix(in srgb, var(--dashboard-surface) 88%, white);
  box-shadow: var(--dashboard-surface-shadow);
  transform: translateY(-1px);
}

.notification-item:focus-visible {
  outline: none;
  box-shadow: 0 0 0 4px var(--dashboard-focus-ring), var(--dashboard-surface-shadow);
}

.notification-item[data-unread='true'] {
  border-color: color-mix(in srgb, var(--notification-accent) 22%, var(--dashboard-surface-border));
}

.notification-item__dot {
  position: absolute;
  left: 0.95rem;
  top: 1rem;
  height: 0.45rem;
  width: 0.45rem;
  border-radius: 999px;
  background: var(--notification-accent);
}

.notification-item__icon {
  display: flex;
  height: 2.5rem;
  width: 2.5rem;
  flex: none;
  align-items: center;
  justify-content: center;
  border-radius: 0.85rem;
  background: var(--notification-icon-bg);
  color: var(--notification-accent);
}

.notification-item__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.9rem;
}

.notification-item__badges {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.45rem;
}

.notification-item__badge {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  background: color-mix(in srgb, var(--notification-accent) 12%, var(--dashboard-surface-strong));
  color: var(--notification-accent);
  font-size: 0.72rem;
  font-weight: 600;
  line-height: 1;
  padding: 0.42rem 0.62rem;
}

.notification-item__title {
  color: var(--dashboard-text-primary);
  font-size: 0.94rem;
  font-weight: 650;
  line-height: 1.45;
  margin-top: 0.45rem;
}

.notification-item__time {
  flex: none;
  color: var(--dashboard-text-muted);
  font-size: 0.75rem;
  white-space: nowrap;
}

.notification-item__preview {
  color: var(--dashboard-text-secondary);
  font-size: 0.86rem;
  line-height: 1.55;
  margin-top: 0.4rem;
}

.notification-item[data-compact='true'] {
  gap: 0.75rem;
  padding: 0.85rem;
}

.notification-item[data-compact='true'] .notification-item__icon {
  height: 2.15rem;
  width: 2.15rem;
}

.notification-item[data-compact='true'] .notification-item__title {
  font-size: 0.88rem;
  margin-top: 0.45rem;
}

.notification-item[data-compact='true'] .notification-item__preview {
  font-size: 0.8rem;
  margin-top: 0.35rem;
}

@media (max-width: 640px) {
  .notification-item__header {
    flex-direction: column;
    gap: 0.5rem;
  }

  .notification-item__time {
    white-space: normal;
  }
}
</style>
