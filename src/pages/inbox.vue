<script setup lang="ts">
import { computed, ref } from 'vue'

type Message = {
  id: string
  from: string
  subject: string
  preview: string
  timestamp: string
  read: boolean
  category: string
}

const mockMessages = ref<Message[]>([])

const selectedMessage = ref<Message | null>(null)
const query = ref('')

const unreadCount = computed(() => mockMessages.value.filter(m => !m.read).length)

const filteredMessages = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return mockMessages.value
  
  return mockMessages.value.filter(m => {
    const haystack = [m.from, m.subject, m.preview].join(' ').toLowerCase()
    return haystack.includes(q)
  })
})

const selectMessage = (message: Message) => {
  selectedMessage.value = message
  message.read = true
}
</script>

<template>
  <UDashboardPanel id="inbox">
    <template #header>
      <UDashboardNavbar title="Inbox">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UBadge
            v-if="unreadCount > 0"
            color="primary"
            variant="subtle"
            :label="`${unreadCount} unread`"
          />
          <NotificationBell />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="flex h-full min-h-0 flex-col">
        <div class="mb-4">
          <UInput
            v-model="query"
            icon="i-lucide-search"
            placeholder="Search messages..."
          />
        </div>

        <div
          v-if="filteredMessages.length === 0"
          class="flex min-h-0 flex-1 items-center justify-center"
        >
          <div class="flex flex-col items-center justify-center py-12 text-center">
            <UIcon name="i-lucide-inbox" class="size-16 text-dimmed" />
            <p class="mt-3 text-sm text-dimmed">No messages found.</p>
          </div>
        </div>

        <div v-else class="flex min-h-0 flex-1 gap-4">
          <div class="w-1/3 min-w-0 space-y-2 overflow-auto">
            <UCard
              v-for="message in filteredMessages"
              :key="message.id"
              :class="['cursor-pointer transition', !message.read && 'bg-primary/5', selectedMessage?.id === message.id && 'ring-2 ring-primary']"
              @click="selectMessage(message)"
            >
              <div class="space-y-1">
                <div class="flex items-start justify-between">
                  <h4 class="text-sm font-semibold">{{ message.from }}</h4>
                  <UBadge
                    v-if="!message.read"
                    color="primary"
                    size="xs"
                    label="New"
                  />
                </div>
                <p class="text-sm font-medium">{{ message.subject }}</p>
                <p class="text-xs text-muted line-clamp-2">{{ message.preview }}</p>
                <div class="flex items-center justify-between">
                  <UBadge variant="subtle" size="xs" :label="message.category" />
                  <span class="text-xs text-muted">{{ message.timestamp }}</span>
                </div>
              </div>
            </UCard>
          </div>

          <div class="flex-1 min-w-0">
            <UCard v-if="selectedMessage" class="h-full">
              <div class="space-y-4">
                <div class="border-b border-default pb-4">
                  <div class="flex items-start justify-between">
                    <div>
                      <h2 class="text-xl font-semibold">{{ selectedMessage.subject }}</h2>
                      <p class="text-sm text-muted">From: {{ selectedMessage.from }}</p>
                    </div>
                    <UBadge variant="subtle" :label="selectedMessage.category" />
                  </div>
                  <p class="mt-2 text-xs text-muted">{{ selectedMessage.timestamp }}</p>
                </div>

                <div class="prose prose-sm max-w-none">
                  <p>{{ selectedMessage.preview }}</p>
                </div>
              </div>
            </UCard>

            <div v-else class="flex h-full items-center justify-center">
              <div class="flex flex-col items-center gap-3 text-center">
                <UIcon name="i-lucide-mail" class="size-16 text-dimmed" />
                <p class="text-sm text-dimmed">Select a message to view</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
