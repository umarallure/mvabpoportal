<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useStorage } from '@vueuse/core'
import type { NavigationMenuItem } from '@nuxt/ui'

import { useAuth } from './composables/useAuth'
import { useNotifications } from './composables/useNotifications'

type HubSpotWindow = Window & typeof globalThis & {
  HubSpotConversations?: {
    widget?: {
      load?: () => void
      remove?: () => void
    }
    on?: (event: string, callback: () => void) => void
  }
  hsConversationsOnReady?: Array<() => void>
}

const toast = useToast()
const route = useRoute()
const auth = useAuth()
const { fetchInitialNotifications, initializeRealtimeListener, cleanup } = useNotifications()

watch(() => auth.state.value.user?.id, (userId) => {
  if (userId) {
    fetchInitialNotifications(userId)
    initializeRealtimeListener(userId)
  } else {
    cleanup()
  }
}, { immediate: true })

const open = ref(false)
const sidebarCollapsed = ref(false)
const chatOpen = ref(false)

const publicPagePaths = ['/login', '/', '/get-started', '/launch-auth', '/managed-auth/callback']
const isPublicPage = computed(() => publicPagePaths.includes(route.path) || route.path.endsWith('/pdf'))
const isStandalonePage = computed(() => Boolean(route.meta.standalone))

function withHubSpotReady(callback: () => void) {
  if (typeof window === 'undefined') return

  const w = window as HubSpotWindow

  if (w.HubSpotConversations?.widget) {
    callback()
    return
  }

  w.hsConversationsOnReady = w.hsConversationsOnReady || []
  w.hsConversationsOnReady.push(callback)
}

function loadHubSpotWidget() {
  withHubSpotReady(() => {
    const widget = (window as HubSpotWindow).HubSpotConversations?.widget
    if (!widget) return

    if (isPublicPage.value) {
      chatOpen.value = false
      widget.remove?.()
    } else {
      widget.load?.()
    }
  })
}

function toggleChat() {
  chatOpen.value = !chatOpen.value
}

watch(() => route.path, (newPath, oldPath) => {
  if (newPath === '/product-guide') {
    sidebarCollapsed.value = true
  } else if (oldPath === '/product-guide') {
    sidebarCollapsed.value = false
  }
})

watch(() => route.fullPath, () => {
  nextTick(() => {
    loadHubSpotWidget()
  })
})

onMounted(() => {
  auth.init().catch(() => {
  })
  loadHubSpotWidget()
})

const links = computed(() => {
  const role = auth.state.value.profile?.role ?? ''

  // publisher_closer sees Lead Intake + Team Profile
  // Publisher closers keep intake access plus their center team page.
  if (role === 'publisher_closer') {
    return [[{
      label: 'Lead Intake',
      icon: 'i-lucide-clipboard-pen',
      to: '/lead-intake',
      onSelect: () => { open.value = false }
    }, {
      label: 'Team Profile',
      icon: 'i-lucide-users',
      to: '/settings/team-profile',
      onSelect: () => { open.value = false }
    }]] satisfies NavigationMenuItem[][]
    return [[
      {
        label: 'Lead Intake',
        icon: 'i-lucide-clipboard-pen',
        to: '/lead-intake',
        onSelect: () => { open.value = false }
      },
      {
        label: 'Team Profile',
        icon: 'i-lucide-users',
        to: '/settings/team-profile',
        onSelect: () => { open.value = false }
      }
    ]] satisfies NavigationMenuItem[][]
  }

  return [[{
    label: 'Dashboard',
    icon: 'i-lucide-house',
    to: '/dashboard',
    onSelect: () => { open.value = false }
  }, {
    label: 'Sales Map',
    icon: 'i-lucide-map',
    to: '/sales-map',
    onSelect: () => { open.value = false }
  }, {
    label: 'Lead Intake',
    icon: 'i-lucide-clipboard-pen',
    to: '/lead-intake',
    onSelect: () => { open.value = false }
  }, {
    label: 'Transfer Pipeline',
    icon: 'i-lucide-arrow-right-left',
    to: '/transfers',
    onSelect: () => { open.value = false }
  }, {
    label: 'Submission Pipeline',
    icon: 'i-lucide-layout-dashboard',
    to: '/submission-portal',
    onSelect: () => { open.value = false }
  }, {
    label: 'Invoicing',
    icon: 'i-lucide-receipt',
    to: '/invoicing',
    onSelect: () => { open.value = false }
  }, {
    label: 'Deel',
    icon: 'i-lucide-landmark',
    to: '/deel',
    onSelect: () => { open.value = false }
  }, {
    label: 'Inbox',
    icon: 'i-lucide-inbox',
    to: '/inbox',
    onSelect: () => { open.value = false }
  }, {
    label: 'Product Offering',
    icon: 'i-lucide-package',
    to: '/product-offering',
    onSelect: () => { open.value = false }
  }, ...(role === 'super_admin' ? [{
    label: 'Users',
    icon: 'i-lucide-users',
    to: '/users',
    onSelect: () => { open.value = false }
  }] : []), ...(['admin', 'super_admin'].includes(role) ? [{
    label: 'Product Guide',
    icon: 'i-lucide-play-circle',
    to: '/product-guide',
    onSelect: () => { open.value = false }
  }] : []), {
    label: 'Settings',
    to: '/settings',
    icon: 'i-lucide-settings',
    defaultOpen: false,
    type: 'trigger',
    children: [{
      label: 'BPO Profile',
      to: '/settings/bpo-profile',
      exact: true,
      onSelect: () => {
        open.value = false
      }
    }, {
      label: 'Team Profile',
      to: '/settings/team-profile',
      exact: true,
      onSelect: () => {
        open.value = false
      }
    }, ...(role === 'super_admin' ? [{
      label: 'Sales Map Admin',
      to: '/settings/sales-map-admin',
      exact: true,
      onSelect: () => {
        open.value = false
      }
    }, {
      label: 'Export Sheets',
      to: '/settings/export-sheets',
      exact: true,
      onSelect: () => {
        open.value = false
      }
    }] : [])]
  }]] satisfies NavigationMenuItem[][]
})

const groups = computed(() => [{
  id: 'links',
  label: 'Go to',
  items: links.value.flat()
}])

const cookie = useStorage('cookie-consent', 'pending')
if (cookie.value !== 'accepted') {
  toast.add({
    title: 'We use first-party cookies to enhance your experience on our website.',
    duration: 0,
    close: false,
    actions: [{
      label: 'Accept',
      color: 'neutral',
      variant: 'outline',
      onClick: () => {
        cookie.value = 'accepted'
      }
    }, {
      label: 'Opt out',
      color: 'neutral',
      variant: 'ghost'
    }]
  })
}
</script>

<template>
  <Suspense>
    <UApp>
      <template v-if="isPublicPage || isStandalonePage">
        <RouterView />
      </template>

      <UDashboardGroup
        v-else
        unit="rem"
        storage="local"
      >
        <UDashboardSidebar
          id="default"
          v-model:open="open"
          v-model:collapsed="sidebarCollapsed"
          collapsible
          resizable
          class="bg-elevated/25 dark:bg-[#202020]"
          :ui="{ footer: 'lg:border-t lg:border-default' }"
        >
          <template #header="{ collapsed }">
            <TeamsMenu :collapsed="collapsed" />
          </template>

          <template #default="{ collapsed }">
            <UDashboardSearchButton :collapsed="collapsed" class="bg-transparent ring-default" />

            <UNavigationMenu
              :collapsed="collapsed"
              :items="links[0]"
              orientation="vertical"
              tooltip
              popover
            />

            <UNavigationMenu
              :collapsed="collapsed"
              :items="links[1]"
              orientation="vertical"
              tooltip
              class="mt-auto"
            />

            <button
              class="w-full flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors cursor-pointer bg-primary text-white hover:bg-primary/90"
              :class="collapsed ? 'p-2' : 'px-2.5 py-2'"
              @click="toggleChat"
            >
              <UIcon name="i-lucide-message-circle" class="size-5 shrink-0" />
              <span v-if="!collapsed" class="truncate">Chat With Us</span>
            </button>
          </template>

          <template #footer="{ collapsed }">
            <UserMenu :collapsed="collapsed" />
          </template>
        </UDashboardSidebar>

        <UDashboardSearch :groups="groups" />

        <RouterView />

        <NotificationsSlideover />

        <div
          class="fixed z-50 rounded-lg shadow-xl"
          :class="chatOpen ? 'bottom-16 left-[280px]' : '-left-full'"
          style="width: 376px; height: 500px;"
        >
          <button
            class="absolute top-2 right-2 z-10 flex items-center justify-center size-7 rounded-full bg-black/40 hover:bg-black/60 text-white cursor-pointer transition-colors"
            @click="toggleChat"
          >
            <UIcon name="i-lucide-x" class="size-4" />
          </button>
          <div
            id="hs-chat-embed"
            class="w-full h-full overflow-hidden rounded-lg"
          />
        </div>
      </UDashboardGroup>
    </UApp>
  </Suspense>
</template>

<style>
#dashboard-sidebar-default[data-collapsed='true'] [data-slot='header'] {
  padding-left: 0 !important;
  padding-right: 0 !important;
}
</style>
