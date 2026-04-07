<script setup lang="ts">
const openDeel = () => {
  window.open('https://www.deel.com', '_blank', 'noopener,noreferrer')
}
</script>

<template>
  <UDashboardPanel id="deel">
    <template #header>
      <UDashboardNavbar title="Deel">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="flex h-full flex-col items-center justify-center gap-8 p-6">

        <!-- Card -->
        <div class="deel-card flex w-full max-w-md flex-col items-center gap-6 rounded-2xl p-10 text-center">

          <!-- Icon -->
          <div class="deel-icon-wrap flex size-16 items-center justify-center rounded-2xl">
            <UIcon name="i-lucide-landmark" class="size-8 deel-icon" />
          </div>

          <!-- Text -->
          <div class="space-y-2">
            <h2 class="text-xl font-bold" style="color: var(--dashboard-text-primary);">Deel Payments</h2>
            <p class="text-sm leading-relaxed" style="color: var(--dashboard-text-muted);">
              Manage your payments, contracts, and payroll through Deel.
              Click below to open the Deel platform in a new tab.
            </p>
          </div>

          <!-- Button -->
          <button type="button" class="deel-btn flex items-center gap-2.5 rounded-xl px-7 py-3 text-sm font-semibold transition-all duration-200" @click="openDeel">
            <UIcon name="i-lucide-external-link" class="size-4" />
            Open Deel
          </button>

          <!-- Note -->
          <p class="text-[11px]" style="color: var(--dashboard-text-muted);">
            Opens in a new tab &mdash; deel.com
          </p>
        </div>

      </div>
    </template>
  </UDashboardPanel>
</template>

<style scoped>
.deel-card {
  background: var(--dashboard-surface);
  border: 1px solid var(--dashboard-surface-border);
  box-shadow: var(--dashboard-surface-shadow);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.deel-icon-wrap {
  background: rgba(174, 64, 16, 0.10);
}

.deel-icon {
  color: var(--ap-accent, #ae4010);
}

.deel-btn {
  background: var(--ap-accent, #ae4010);
  color: #fff;
  box-shadow: 0 4px 14px rgba(174, 64, 16, 0.35);
}

.deel-btn:hover {
  background: color-mix(in srgb, var(--ap-accent, #ae4010) 85%, #000);
  box-shadow: 0 6px 20px rgba(174, 64, 16, 0.45);
  transform: translateY(-1px);
}

.deel-btn:active {
  transform: translateY(0);
  box-shadow: 0 2px 8px rgba(174, 64, 16, 0.30);
}
</style>
