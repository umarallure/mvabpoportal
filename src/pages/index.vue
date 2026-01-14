<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { BRANDING } from '../lib/branding'

const modules = [{
  title: 'Transfers pipeline',
  description: 'Track transfers across stages like pending info, approval, and callbacks with a clear kanban view.',
  icon: 'i-lucide-briefcase'
}, {
  title: 'Retainers & assignments',
  description: 'View retainer records, filter by status, and see which attorney is assigned before handoff.',
  icon: 'i-lucide-id-card'
}, {
  title: 'Invoicing & reporting',
  description: 'Stay on top of invoices and export operational reports for partners and internal QA.',
  icon: 'i-lucide-clipboard-list'
}]

const highlights = [{
  title: 'Built for BPO operations',
  body: 'One workspace for agents and admins to manage transfers, retainers, and follow-ups end to end.'
}, {
  title: 'Clear stage tracking',
  body: 'Move work through defined stages like pending information and pending approval with fewer handoff misses.'
}, {
  title: 'Sales map visibility',
  body: 'See where you can sell, where it is restricted, and how volume looks by state.'
}]

const stats = [{
  value: 'Stage clarity',
  label: 'Transfers grouped by status so teams know what to work next'
}, {
  value: 'Fewer misses',
  label: 'Visibility into pending info and callbacks before transfers stall'
}, {
  value: 'Export ready',
  label: 'Download transfer, retainer, invoice, and analytics reports when needed'
}]

const steps = [{
  title: 'Triage transfers',
  copy: 'Work transfers by stage and keep your team focused on approvals, missing info, and callbacks.'
}, {
  title: 'Confirm retainer assignment',
  copy: 'Review retainer records, verify details, and confirm attorney assignment before moving forward.'
}, {
  title: 'Track billing and export',
  copy: 'Monitor invoicing status and export reports for reconciliation and partner updates.'
}]
</script>

<template>
  <div class="min-h-screen bg-[var(--ap-bg)] text-white">
    <div class="relative isolate overflow-hidden bg-gradient-to-b from-[var(--ap-surface)] via-[var(--ap-surface-soft)] to-[var(--ap-bg)]">
      <div class="absolute inset-0 pointer-events-none">
        <div class="absolute -top-32 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-[var(--ap-accent)]/40 blur-[120px]" />
        <div class="absolute top-20 right-12 h-48 w-48 rounded-full bg-[var(--ap-amber)]/30 blur-[90px]" />
      </div>

      <header class="flex w-full items-center justify-between px-6 py-6 lg:px-10">
        <div class="flex items-center gap-3">
          <img :src="BRANDING.logo" alt="Publisher Portal" class="h-10 w-auto" />
        </div>
        <div class="hidden items-center gap-3 text-sm font-medium text-white/70 lg:flex">
          <RouterLink to="/login" class="rounded-full border border-white/15 px-4 py-2 transition hover:border-white/40 hover:text-white">
            Log in
          </RouterLink>
        </div>
      </header>

      <main class="flex w-full flex-col gap-14 px-6 pb-20 pt-10 lg:px-10 lg:pb-32 lg:pt-16">
        <section class="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div class="space-y-6">
            <h1 class="text-4xl font-semibold leading-tight text-white md:text-5xl lg:text-6xl">
              A BPO workspace for transfers, retainers, and operational reporting.
            </h1>
            <p class="text-base leading-relaxed text-white/70 md:text-lg">
              Manage transfers by stage, keep retainer records organized, and stay on top of invoicing.
              Use the sales map to guide where you can sell and export clean reports when partners ask.
            </p>
            <div class="flex flex-col gap-3 text-sm text-white/70 sm:flex-row sm:items-center sm:gap-6">
              <div class="flex items-center gap-2">
                <span class="text-2xl font-bold text-white">250+</span>
                active matters orchestrated each month.
              </div>
              <div class="flex items-center gap-2">
                <span class="text-2xl font-bold text-white">12</span>
                publisher teams scaling with Publisher Portal.
              </div>
            </div>
            <div class="flex flex-col items-center gap-3 sm:flex-row">
              <RouterLink
                to="/get-started"
                class="inline-flex items-center justify-center self-center rounded-xl bg-[var(--ap-accent)] px-6 py-3 text-center text-sm font-semibold uppercase tracking-wide text-white shadow-lg transition hover:translate-y-0.5 sm:w-auto"
                style="box-shadow: 0 15px 30px var(--ap-accent-shadow);"
              >
                Get started
              </RouterLink>
            </div>
          </div>

          <div class="rounded-[32px] border border-white/10 bg-white/5 p-6 shadow-2xl shadow-black/60 backdrop-blur-xl">
            <div class="rounded-3xl border border-white/10 bg-black/30 p-6">
              <div class="flex items-center justify-between text-xs uppercase tracking-[0.4em] text-white/50">
                <span>Workflow snapshot</span>
                <span>This month</span>
              </div>
              <div class="mt-6 space-y-4">
                <div class="rounded-2xl bg-white/5 p-4">
                  <p class="text-xs uppercase tracking-[0.4em] text-white/50">Transfers</p>
                  <p class="mt-2 text-3xl font-semibold text-white">42 matters</p>
                  <p class="text-sm text-white/60">Work items staged for approval, callbacks, and missing info.</p>
                </div>
                <div class="rounded-2xl bg-white/5 p-4">
                  <p class="text-xs uppercase tracking-[0.4em] text-white/50">Retainers</p>
                  <p class="mt-2 text-3xl font-semibold text-white">17 pending</p>
                  <p class="text-sm text-white/60">Pending review, status updates, or attorney assignment.</p>
                </div>
                <div class="rounded-2xl bg-white/5 p-4">
                  <p class="text-xs uppercase tracking-[0.4em] text-white/50">Invoicing</p>
                  <p class="mt-2 text-3xl font-semibold text-white">8 welcomes</p>
                  <p class="text-sm text-white/60">Invoices in motion with paid, pending, and chargeback tracking.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section class="grid gap-5 rounded-3xl border border-white/10 bg-white/5 p-6 lg:grid-cols-3">
          <div v-for="highlight in highlights" :key="highlight.title" class="space-y-3 rounded-2xl border border-white/10 bg-black/20 p-5">
            <h3 class="text-lg font-semibold text-white">{{ highlight.title }}</h3>
            <p class="text-sm leading-relaxed text-white/70">
              {{ highlight.body }}
            </p>
          </div>
        </section>

        <section class="space-y-8">
          <div class="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p class="text-xs uppercase tracking-[0.4em] text-white/50">Modules</p>
              <h2 class="mt-1 text-3xl font-semibold text-white">One workspace for every transfer and handoff step.</h2>
            </div>
            <RouterLink to="/dashboard" class="text-sm font-semibold text-[var(--ap-highlight)] hover:text-white">
              See dashboard view →
            </RouterLink>
          </div>
          <div class="grid gap-5 lg:grid-cols-3">
            <article
              v-for="module in modules"
              :key="module.title"
              class="rounded-3xl border border-white/10 bg-gradient-to-b from-white/5 to-white/0 p-6 transition hover:border-white/25"
            >
              <div class="flex items-center gap-3">
                <div class="flex size-12 items-center justify-center rounded-2xl bg-white/10">
                  <UIcon :name="module.icon" class="size-6 text-white" />
                </div>
                <h3 class="text-xl font-semibold text-white">{{ module.title }}</h3>
              </div>
              <p class="mt-4 text-sm text-white/70">
                {{ module.description }}
              </p>
            </article>
          </div>
        </section>

        <section class="grid gap-6 rounded-3xl border border-white/10 bg-black/20 p-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div class="space-y-6">
            <p class="text-xs uppercase tracking-[0.4em] text-white/50">How teams use it</p>
            <h2 class="text-3xl font-semibold text-white">Designed for daily BPO operations.</h2>
            <div class="space-y-4">
              <div
                v-for="(step, index) in steps"
                :key="step.title"
                class="rounded-2xl border border-white/10 bg-white/5 p-4"
              >
                <div class="flex items-center gap-3 text-sm font-semibold tracking-wide text-[#f9d7b1]">
                  <span class="text-white/40">{{ `0${index + 1}` }}</span>
                  {{ step.title }}
                </div>
                <p class="mt-2 text-sm leading-relaxed text-white/70">
                  {{ step.copy }}
                </p>
              </div>
            </div>
          </div>
          <div class="flex flex-col justify-between rounded-3xl border border-white/10 bg-gradient-to-b from-[var(--ap-accent)] to-[var(--ap-accent-dark)] p-6">
            <div>
              <p class="text-xs uppercase tracking-[0.4em] text-white/60">Impact</p>
              <h3 class="mt-2 text-3xl font-semibold text-white">Less ambiguity across transfers and handoffs.</h3>
            </div>
            <div class="mt-6 grid gap-4">
              <div v-for="stat in stats" :key="stat.label" class="rounded-2xl bg-black/30 p-4">
                <p class="text-4xl font-semibold text-white">{{ stat.value }}</p>
                <p class="text-sm text-white/70">{{ stat.label }}</p>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  </div>
</template>
