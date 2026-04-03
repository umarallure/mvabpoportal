<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'

export interface KpiCardProps {
  title: string
  value: number | string
  icon: string
  compact?: boolean
  accent?: string
  loading?: boolean
  progress?: number | null
  progressLabel?: string
  footerContent?: string
  clickable?: boolean
  to?: string
  href?: string
  target?: string
  rel?: string
  disabled?: boolean
  type?: 'button' | 'submit' | 'reset'
  stagger?: number
  ariaLabel?: string
}

const props = withDefaults(defineProps<KpiCardProps>(), {
  compact: false,
  accent: 'var(--dashboard-accent-primary)',
  loading: false,
  clickable: false,
  disabled: false,
  type: 'button',
  stagger: 0
})

const emit = defineEmits<{
  click: [event: MouseEvent]
}>()

const slots = defineSlots<{
  footer?: (props: Record<string, never>) => unknown
}>()

const mixWithTransparent = (color: string, amount: number) =>
  `color-mix(in srgb, ${color} ${amount}%, transparent)`

const componentTag = computed(() => {
  if (props.disabled) return 'article'
  if (props.to) return RouterLink
  if (props.href) return 'a'
  if (props.clickable) return 'button'
  return 'article'
})

const componentProps = computed<Record<string, unknown>>(() => {
  if (props.disabled) {
    return { 'aria-disabled': 'true' }
  }

  if (props.to) {
    return { to: props.to }
  }

  if (props.href) {
    return {
      href: props.href,
      target: props.target,
      rel: props.rel ?? (props.target === '_blank' ? 'noreferrer noopener' : undefined)
    }
  }

  if (props.clickable) {
    return {
      type: props.type,
      onClick: (event: MouseEvent) => emit('click', event)
    }
  }

  return {}
})

const hasFooter = computed(() => Boolean(props.footerContent) || Boolean(slots.footer))
const hasProgress = computed(() => props.progress !== null && props.progress !== undefined)
const showProgress = computed(() => hasProgress.value)

const animationDelay = computed(() => {
  const mapped = [80, 160, 240, 350][props.stagger] ?? props.stagger * 80
  return `${mapped}ms`
})

const progressValue = computed(() => Math.max(0, Math.min(100, Math.round(props.progress ?? 0))))

const styleVars = computed(() => ({
  '--dashboard-enter-delay': animationDelay.value,
  '--_accent': props.accent,
  '--_accent-border': mixWithTransparent(props.accent, 30),
  '--_accent-tint-8': mixWithTransparent(props.accent, 8),
  '--_accent-tint-10': mixWithTransparent(props.accent, 10),
  '--_accent-tint-20': mixWithTransparent(props.accent, 20),
  '--_accent-tint-24': mixWithTransparent(props.accent, 24),
  '--_accent-tint-36': mixWithTransparent(props.accent, 36)
}))
</script>

<template>
  <component
    :is="componentTag"
    v-bind="componentProps"
    class="dashboard-kpi-card dashboard-surface-card dashboard-fade-up"
    :class="{
      'dashboard-kpi-card--compact': compact,
      'dashboard-kpi-card--interactive': !disabled && (Boolean(to) || Boolean(href) || clickable),
      'dashboard-kpi-card--disabled': disabled
    }"
    :style="styleVars"
    :aria-busy="loading ? 'true' : undefined"
    :aria-label="ariaLabel ?? title"
  >
    <div class="dashboard-kpi-card__body">
      <div class="dashboard-kpi-card__header">
        <div class="dashboard-kpi-card__copy">
          <p class="dashboard-kpi-card__eyebrow">
            {{ title }}
          </p>

          <div class="dashboard-kpi-card__value-wrap">
            <span v-if="!loading" class="dashboard-kpi-card__value">{{ value }}</span>
            <span v-else class="dashboard-kpi-card__skeleton dashboard-kpi-card__skeleton--metric" />
          </div>
        </div>

        <div class="dashboard-kpi-card__icon-tile" aria-hidden="true">
          <UIcon :name="icon" class="size-5" />
        </div>
      </div>

      <div class="dashboard-kpi-card__bottom">
        <div v-if="showProgress" class="dashboard-kpi-card__progress">
          <template v-if="!loading">
            <div class="dashboard-kpi-card__progress-header">
              <span class="dashboard-kpi-card__progress-label">
                {{ progressLabel || 'Progress' }}
              </span>
              <span class="dashboard-kpi-card__progress-value">
                {{ progressValue }}%
              </span>
            </div>

            <div class="dashboard-kpi-card__progress-track" aria-hidden="true">
              <div class="dashboard-kpi-card__progress-fill" :style="{ width: `${progressValue}%` }" />
            </div>
          </template>

          <template v-else>
            <div class="dashboard-kpi-card__progress-header">
              <span class="dashboard-kpi-card__skeleton dashboard-kpi-card__skeleton--label" />
              <span class="dashboard-kpi-card__skeleton dashboard-kpi-card__skeleton--percent" />
            </div>

            <div class="dashboard-kpi-card__progress-track" aria-hidden="true">
              <div class="dashboard-kpi-card__progress-fill dashboard-kpi-card__progress-fill--loading" />
            </div>
          </template>
        </div>

        <div v-if="hasFooter" class="dashboard-kpi-card__footer">
          <span
            v-if="loading"
            class="dashboard-kpi-card__skeleton dashboard-kpi-card__skeleton--footer"
          />

          <slot v-else-if="$slots.footer" name="footer" />

          <p v-else class="dashboard-kpi-card__footer-copy">
            {{ footerContent }}
          </p>
        </div>
      </div>
    </div>

    <div class="dashboard-kpi-card__accent-strip" aria-hidden="true" />
  </component>
</template>

<style scoped>
.dashboard-kpi-card {
  width: 100%;
  height: 100%;
  min-height: 178px;
  text-align: left;
  transition:
    border-color 300ms ease,
    box-shadow 300ms ease,
    background-color 300ms ease;
}

.dashboard-kpi-card::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(circle at top right, var(--_accent-tint-20), transparent 38%),
    linear-gradient(180deg, var(--_accent-tint-8), transparent 68%);
  opacity: 0.85;
}

.dashboard-kpi-card--interactive {
  cursor: pointer;
}

.dashboard-kpi-card--interactive:hover {
  border-color: var(--_accent-border);
  box-shadow: var(--dashboard-surface-shadow-hover);
}

.dashboard-kpi-card--interactive:focus-visible {
  outline: none;
  box-shadow:
    0 0 0 4px var(--dashboard-focus-ring),
    var(--dashboard-surface-shadow-hover);
}

.dashboard-kpi-card--disabled {
  cursor: default;
  opacity: 0.72;
}

.dashboard-kpi-card__body {
  display: flex;
  height: 100%;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem;
}

.dashboard-kpi-card--compact {
  min-height: 136px;
}

@media (min-width: 768px) {
  .dashboard-kpi-card__body {
    padding: 1.25rem;
  }
}

.dashboard-kpi-card--compact .dashboard-kpi-card__body {
  gap: 0.75rem;
  padding: 0.8rem;
}

@media (min-width: 768px) {
  .dashboard-kpi-card--compact .dashboard-kpi-card__body {
    padding: 0.9rem;
  }
}

.dashboard-kpi-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.875rem;
}

.dashboard-kpi-card__copy {
  min-width: 0;
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 0.35rem;
}

.dashboard-kpi-card__eyebrow {
  font-size: 10px;
  font-weight: 500;
  line-height: 1.3;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--dashboard-text-muted);
}

.dashboard-kpi-card--compact .dashboard-kpi-card__eyebrow {
  display: -webkit-box;
  min-height: 2.2rem;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  white-space: normal;
  letter-spacing: 0.12em;
}

.dashboard-kpi-card__value-wrap {
  min-height: 2.15rem;
}

.dashboard-kpi-card__value {
  display: block;
  font-size: 1.5rem;
  font-weight: 700;
  line-height: 1.08;
  color: var(--dashboard-text-primary);
  font-variant-numeric: tabular-nums;
}

.dashboard-kpi-card--compact .dashboard-kpi-card__value {
  font-size: 1.35rem;
}

@media (min-width: 768px) {
  .dashboard-kpi-card__value {
    font-size: 1.875rem;
  }
}

@media (min-width: 768px) {
  .dashboard-kpi-card--compact .dashboard-kpi-card__value {
    font-size: 1.55rem;
  }
}

.dashboard-kpi-card__icon-tile {
  display: flex;
  height: 40px;
  width: 40px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 0.875rem;
  background: var(--_accent-tint-10);
  color: var(--_accent);
  transition: background-color 300ms ease;
}

.dashboard-kpi-card--compact .dashboard-kpi-card__icon-tile {
  height: 36px;
  width: 36px;
  border-radius: 0.75rem;
}

@media (min-width: 768px) {
  .dashboard-kpi-card__icon-tile {
    height: 44px;
    width: 44px;
  }
}

@media (min-width: 768px) {
  .dashboard-kpi-card--compact .dashboard-kpi-card__icon-tile {
    height: 38px;
    width: 38px;
  }
}

.dashboard-kpi-card--interactive:hover .dashboard-kpi-card__icon-tile,
.dashboard-kpi-card--interactive:focus-visible .dashboard-kpi-card__icon-tile {
  background: var(--_accent-tint-20);
}

.dashboard-kpi-card__bottom {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.dashboard-kpi-card--compact .dashboard-kpi-card__bottom {
  gap: 0.55rem;
}

.dashboard-kpi-card__progress {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.dashboard-kpi-card__progress-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.dashboard-kpi-card__progress-label,
.dashboard-kpi-card__progress-value {
  font-size: 11px;
  line-height: 1.4;
  font-variant-numeric: tabular-nums;
}

.dashboard-kpi-card__progress-label {
  color: var(--dashboard-text-muted);
}

.dashboard-kpi-card__progress-value {
  font-weight: 600;
  color: var(--_accent);
}

.dashboard-kpi-card__progress-track {
  height: 5px;
  overflow: hidden;
  border-radius: 999px;
  background: color-mix(in srgb, var(--_accent) 10%, var(--dashboard-divider));
}

.dashboard-kpi-card__progress-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--_accent), var(--_accent-tint-36));
  animation: dashboard-kpi-fill 700ms ease-out both;
}

.dashboard-kpi-card__progress-fill--loading {
  width: 28%;
}

.dashboard-kpi-card__footer {
  min-height: 1rem;
  color: var(--dashboard-text-muted);
}

.dashboard-kpi-card--compact .dashboard-kpi-card__footer {
  min-height: 0.8rem;
}

.dashboard-kpi-card__footer-copy {
  font-size: 12px;
  line-height: 1.45;
}

.dashboard-kpi-card__accent-strip {
  position: absolute;
  inset-inline: 0;
  bottom: 0;
  height: 2px;
  background: linear-gradient(90deg, var(--_accent), color-mix(in srgb, var(--_accent) 42%, white));
}

.dashboard-kpi-card__skeleton {
  display: block;
  border-radius: 999px;
  background: color-mix(in srgb, var(--dashboard-text-muted) 32%, transparent);
  animation: dashboard-pulse 1.5s ease-in-out infinite;
}

.dashboard-kpi-card__skeleton--metric {
  height: 1.9rem;
  width: 6.25rem;
}

.dashboard-kpi-card--compact .dashboard-kpi-card__skeleton--metric {
  height: 1.55rem;
  width: 4.8rem;
}

.dashboard-kpi-card__skeleton--label {
  height: 0.7rem;
  width: 4.25rem;
}

.dashboard-kpi-card__skeleton--percent {
  height: 0.7rem;
  width: 2rem;
}

.dashboard-kpi-card__skeleton--footer {
  height: 0.85rem;
  width: 8.5rem;
}

.dashboard-kpi-card:hover :deep(.dashboard-kpi-card__footer-link),
.dashboard-kpi-card:focus-visible :deep(.dashboard-kpi-card__footer-link) {
  color: var(--_accent);
}

.dashboard-kpi-card:hover :deep(.dashboard-kpi-card__footer-arrow),
.dashboard-kpi-card:focus-visible :deep(.dashboard-kpi-card__footer-arrow) {
  transform: translateX(2px);
}

:deep(.dashboard-kpi-card__footer-link) {
  transition: color 300ms ease;
}

:deep(.dashboard-kpi-card__footer-arrow) {
  display: inline-block;
  transition: transform 300ms ease;
}

@keyframes dashboard-kpi-fill {
  from {
    width: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .dashboard-kpi-card__progress-fill {
    animation: none;
  }
}
</style>
