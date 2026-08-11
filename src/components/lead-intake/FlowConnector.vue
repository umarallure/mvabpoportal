<script setup lang="ts">
defineProps<{
  label: string
}>()
</script>

<template>
  <div class="flex flex-col items-center gap-1 py-1" aria-hidden="true">
    <div class="h-3 w-px bg-[var(--ap-accent)]/30" />
    <span class="rounded-full border border-[var(--ap-accent)]/25 bg-[var(--ap-accent)]/[0.06] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ap-accent)]">
      {{ label }}
    </span>
    <div class="h-3 w-px bg-[var(--ap-accent)]/30" />
  </div>
</template>
