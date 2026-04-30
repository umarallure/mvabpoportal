<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useStorage } from '@vueuse/core'
import type { NavigationMenuItem } from '@nuxt/ui'

import { useAuth } from './composables/useAuth'
import { useNotifications } from './composables/useNotifications'

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

watch(() => route.path, (newPath, oldPath) => {
  if (newPath === '/product-guide') {
    sidebarCollapsed.value = true
  } else if (oldPath === '/product-guide') {
    sidebarCollapsed.value = false
  }
})

onMounted(() => {
  auth.init().catch(() => {
  })
})

const links = computed(() => {
  const role = auth.state.value.profile?.role ?? ''

  // Publisher closers keep intake access plus their center team page.
  if (role === 'publisher_closer') {
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

const isPublicPage = computed(() => ['/login', '/', '/get-started'].includes(route.path))
const isStandalonePage = computed(() => Boolean(route.meta.standalone))

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
          </template>

          <template #footer="{ collapsed }">
            <UserMenu :collapsed="collapsed" />
          </template>
        </UDashboardSidebar>

        <UDashboardSearch :groups="groups" />

        <RouterView />

        <NotificationsSlideover />
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
