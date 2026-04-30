<script setup lang="ts">
import { computed } from 'vue'
import { computed } from 'vue'
import type { NavigationMenuItem } from '@nuxt/ui'
import { useAuth } from '../composables/useAuth'

const auth = useAuth()

const links = computed(() => {
  const role = auth.state.value.profile?.role
  const items: NavigationMenuItem[] = role === 'publisher_closer'
    ? []
    : [{
        label: 'BPO Profile',
        icon: 'i-lucide-building-2',
        to: '/settings/bpo-profile',
        exact: true
      }]

  items.push({
    label: 'Team Profile',
    icon: 'i-lucide-users',
    to: '/settings/team-profile',
    exact: true
  })

  return [items] satisfies NavigationMenuItem[][]
})

</script>

<template>
  <UDashboardPanel id="settings" :ui="{ body: 'lg:py-12' }">
    <template #header>
      <UDashboardNavbar title="Settings">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <NotificationBell />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar>
        <!-- NOTE: The `-mx-1` class is used to align with the `DashboardSidebarCollapse` button here. -->
        <UNavigationMenu :items="links" highlight class="-mx-1 flex-1" />
      </UDashboardToolbar>
    </template>

    <template #body>
      <div class="flex flex-col gap-4 sm:gap-6 lg:gap-12 w-full">
        <RouterView />
      </div>
    </template>
  </UDashboardPanel>
</template>
