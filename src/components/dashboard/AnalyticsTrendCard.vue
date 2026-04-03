<script setup lang="ts">
import { computed, useId, useTemplateRef } from 'vue'
import { useElementSize } from '@vueuse/core'
import { CurveType } from '@unovis/ts'
import { VisArea, VisCrosshair, VisLine, VisTooltip, VisXYContainer } from '@unovis/vue'

export interface AnalyticsTrendPoint {
  key: string
  label: string
  shortLabel?: string
  value: number
  count?: number
  summary?: string
  emptyLabel?: string
}

export interface AnalyticsTrendCardProps {
  title: string
  subtitle?: string
  icon: string
  headlineValue?: number | string
  headlineLabel?: string
  accent?: string
  compact?: boolean
  chartMinHeight?: number
  showHeaderDivider?: boolean
  loading?: boolean
  points: AnalyticsTrendPoint[]
  summaryPoints?: AnalyticsTrendPoint[]
  growth?: number | null
  growthLabel?: string
  ariaLabel?: string
  stagger?: number
  valueFormatter?: (value: number, point: AnalyticsTrendPoint) => string
  countFormatter?: (count: number, point: AnalyticsTrendPoint) => string
  tooltipFormatter?: (point: AnalyticsTrendPoint) => string
}

const props = withDefaults(defineProps<AnalyticsTrendCardProps>(), {
  accent: 'var(--dashboard-accent-primary)',
  compact: false,
  chartMinHeight: undefined,
  showHeaderDivider: true,
  subtitle: '',
  headlineValue: undefined,
  headlineLabel: '',
  loading: false,
  growth: null,
  growthLabel: 'vs last month',
  stagger: 0,
  valueFormatter: (value: number) => new Intl.NumberFormat('en-US').format(value),
  countFormatter: (count: number) => `${count} ${count === 1 ? 'item' : 'items'}`
})

const chartHost = useTemplateRef<HTMLElement | null>('chartHost')
const { width, height } = useElementSize(chartHost)
const gradientId = `dashboard-trend-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`

const mixWithTransparent = (color: string, amount: number) =>
  `color-mix(in srgb, ${color} ${amount}%, transparent)`

const x = (_: AnalyticsTrendPoint, index: number) => index
const y = (point: AnalyticsTrendPoint) => point.value

const animationDelay = computed(() => {
  const mapped = [80, 160, 240, 350][props.stagger] ?? props.stagger * 80
  return `${mapped}ms`
})

const styleVars = computed(() => ({
  '--dashboard-enter-delay': animationDelay.value,
  '--_accent': props.accent,
  '--_accent-tint-6': mixWithTransparent(props.accent, 6),
  '--_accent-tint-12': mixWithTransparent(props.accent, 12),
  '--_accent-tint-20': mixWithTransparent(props.accent, 20),
  '--_accent-tint-24': mixWithTransparent(props.accent, 24)
}))

const chartSeries = computed(() => props.points)

const summarySeries = computed(() => {
  const source = props.summaryPoints?.length ? props.summaryPoints : props.points
  return source.slice(-6)
})

const hasData = computed(() => chartSeries.value.some(point => point.value > 0 || (point.count ?? 0) > 0))

const hasRecentData = computed(() => chartSeries.value.slice(-2).some(point => point.value > 0 || (point.count ?? 0) > 0))

const showGrowth = computed(() => props.growth !== null && props.growth !== undefined && hasRecentData.value)

const growthIsPositive = computed(() => (props.growth ?? 0) >= 0)

const resolvedChartMinHeight = computed(() => props.chartMinHeight ?? (props.compact ? 112 : 220))

const chartPadding = computed(() => (
  props.compact
    ? { top: 14, right: 10, bottom: 4, left: 10 }
    : { top: 20, right: 12, bottom: 10, left: 12 }
))

const yDomain = computed<[number, number]>(() => {
  const max = Math.max(0, ...chartSeries.value.map(point => point.value))
  if (max === 0) return [0, 1]
  return [0, Math.ceil(max * 1.18)]
})

const chartWidth = computed(() => Math.max(0, Math.round(width.value)))

const chartHeight = computed(() => Math.max(resolvedChartMinHeight.value, Math.round(height.value || resolvedChartMinHeight.value)))

const svgDefs = computed(() => `
  <linearGradient id="${gradientId}" x1="0" x2="0" y1="0" y2="1">
    <stop offset="0%" style="stop-color:${props.accent};stop-opacity:0.24;" />
    <stop offset="100%" style="stop-color:${props.accent};stop-opacity:0.02;" />
  </linearGradient>
`)

const formatValue = (point: AnalyticsTrendPoint) => props.valueFormatter(point.value, point)

const formatCount = (point: AnalyticsTrendPoint) => {
  const count = point.count ?? point.value
  return point.summary || props.countFormatter(count, point)
}

const isEmptyPoint = (point: AnalyticsTrendPoint) => point.value <= 0 && (point.count ?? 0) <= 0

const tooltipText = (point: AnalyticsTrendPoint) => {
  if (props.tooltipFormatter) return props.tooltipFormatter(point)
  if (isEmptyPoint(point)) return `${point.shortLabel ?? point.label}: ${point.emptyLabel ?? 'No data yet'}`
  return `${point.shortLabel ?? point.label}: ${formatValue(point)} across ${formatCount(point)}`
}
</script>

<template>
  <section
    class="dashboard-trend-card dashboard-surface-card dashboard-fade-up"
    :class="{
      'dashboard-trend-card--compact': compact,
      'dashboard-trend-card--header-divider': showHeaderDivider
    }"
    :style="styleVars"
    :aria-label="ariaLabel ?? title"
    :aria-busy="loading ? 'true' : undefined"
  >
    <div class="dashboard-trend-card__inner">
      <header class="dashboard-trend-card__header">
        <div class="dashboard-trend-card__heading">
          <div class="dashboard-trend-card__icon" aria-hidden="true">
            <UIcon :name="icon" class="size-[18px]" />
          </div>

          <div class="dashboard-trend-card__copy">
            <div v-if="loading" class="dashboard-trend-card__loading-copy">
              <span class="dashboard-skeleton dashboard-trend-card__loading-line dashboard-trend-card__loading-line--title" />
              <span class="dashboard-skeleton dashboard-trend-card__loading-line dashboard-trend-card__loading-line--subtitle" />
            </div>

            <template v-else>
              <p class="dashboard-trend-card__title">
                {{ title }}
              </p>
              <p v-if="subtitle" class="dashboard-trend-card__subtitle">
                {{ subtitle }}
              </p>
              <div v-if="headlineValue !== undefined" class="dashboard-trend-card__headline">
                <span class="dashboard-trend-card__headline-value">{{ headlineValue }}</span>
                <span v-if="headlineLabel" class="dashboard-trend-card__headline-label">{{ headlineLabel }}</span>
              </div>
            </template>
          </div>
        </div>

        <div v-if="loading" class="dashboard-skeleton dashboard-trend-card__growth-skeleton" />

        <div
          v-else-if="showGrowth"
          class="dashboard-trend-card__growth"
          :class="growthIsPositive ? 'dashboard-trend-card__growth--positive' : 'dashboard-trend-card__growth--negative'"
        >
          <UIcon :name="growthIsPositive ? 'i-lucide-trending-up' : 'i-lucide-trending-down'" class="size-4" />
          <span class="dashboard-trend-card__growth-value">
            {{ growthIsPositive ? '+' : '' }}{{ growth }}%
          </span>
          <span class="dashboard-trend-card__growth-label">
            {{ growthLabel }}
          </span>
        </div>
      </header>

      <div class="dashboard-trend-card__chart-shell">
        <div v-if="loading" class="dashboard-trend-card__chart-loading">
          <div class="dashboard-trend-card__chart-bars" aria-hidden="true">
            <span
              v-for="bar in 6"
              :key="bar"
              class="dashboard-skeleton dashboard-trend-card__chart-bar"
              :style="{ height: `${48 + (bar % 4) * 22}px` }"
            />
          </div>
        </div>

        <div v-else ref="chartHost" class="dashboard-trend-card__chart-host">
          <div v-if="!hasData" class="dashboard-trend-card__empty">
            <p>No data yet</p>
            <span>New activity will appear here once recent records land.</span>
          </div>

          <VisXYContainer
            :data="chartSeries"
            :width="chartWidth"
            :height="chartHeight"
            :padding="chartPadding"
            :y-domain="yDomain"
            :svg-defs="svgDefs"
            class="dashboard-trend-card__chart"
            :aria-label="ariaLabel ?? `${title} trend`"
          >
            <VisArea
              :x="x"
              :y="y"
              :curve-type="CurveType.MonotoneX"
              :color="`url(#${gradientId})`"
            />

            <VisLine
              :x="x"
              :y="y"
              :curve-type="CurveType.MonotoneX"
              :line-width="2"
              :color="props.accent"
            />

            <VisCrosshair
              :x="x"
              :y="y"
              :color="props.accent"
              :template="tooltipText"
            />

            <VisTooltip />
          </VisXYContainer>
        </div>
      </div>

      <div class="dashboard-trend-card__months">
        <div v-if="loading" class="dashboard-trend-card__month-grid">
          <div
            v-for="item in 6"
            :key="item"
            class="dashboard-trend-card__month dashboard-trend-card__month--loading"
          >
            <span class="dashboard-skeleton dashboard-trend-card__month-loading dashboard-trend-card__month-loading--label" />
            <span class="dashboard-skeleton dashboard-trend-card__month-loading dashboard-trend-card__month-loading--value" />
            <span class="dashboard-skeleton dashboard-trend-card__month-loading dashboard-trend-card__month-loading--meta" />
          </div>
        </div>

        <div v-else class="dashboard-trend-card__month-grid">
          <div
            v-for="point in summarySeries"
            :key="point.key"
            class="dashboard-trend-card__month"
          >
            <p class="dashboard-trend-card__month-label">
              {{ point.shortLabel ?? point.label }}
            </p>

            <template v-if="!isEmptyPoint(point)">
              <p class="dashboard-trend-card__month-value">
                {{ formatValue(point) }}
              </p>
              <p class="dashboard-trend-card__month-meta">
                {{ formatCount(point) }}
              </p>
            </template>

            <p v-else class="dashboard-trend-card__month-empty">
              {{ point.emptyLabel ?? 'No data yet' }}
            </p>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.dashboard-trend-card {
  width: 100%;
}

.dashboard-trend-card::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(circle at top right, var(--_accent-tint-20), transparent 32%),
    linear-gradient(180deg, var(--_accent-tint-6), transparent 62%);
}

.dashboard-trend-card__inner {
  display: flex;
  height: auto;
  flex-direction: column;
  padding: 1rem;
}

@media (min-width: 768px) {
  .dashboard-trend-card__inner {
    padding: 1.25rem;
  }
}

.dashboard-trend-card--compact .dashboard-trend-card__inner {
  padding: 0.85rem 0.95rem 0.75rem;
}

@media (min-width: 768px) {
  .dashboard-trend-card--compact .dashboard-trend-card__inner {
    padding: 0.95rem 1rem 0.85rem;
  }
}

.dashboard-trend-card__header {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.dashboard-trend-card--header-divider .dashboard-trend-card__header {
  border-bottom: 1px solid var(--dashboard-divider);
  padding-bottom: 0.7rem;
}

.dashboard-trend-card--compact .dashboard-trend-card__header {
  gap: 0.65rem;
}

@media (min-width: 1280px) {
  .dashboard-trend-card__header {
    flex-direction: row;
    align-items: flex-start;
    justify-content: space-between;
  }
}

.dashboard-trend-card__heading {
  display: flex;
  align-items: flex-start;
  gap: 0.875rem;
}

.dashboard-trend-card__icon {
  display: flex;
  height: 32px;
  width: 32px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 0.75rem;
  background: var(--_accent-tint-12);
  color: var(--_accent);
}

.dashboard-trend-card__copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 0.2rem;
}

.dashboard-trend-card__title {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.35;
  color: var(--dashboard-text-primary);
}

.dashboard-trend-card__subtitle {
  font-size: 11px;
  line-height: 1.45;
  color: var(--dashboard-text-muted);
}

.dashboard-trend-card__headline {
  margin-top: 0.55rem;
  display: inline-flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.45rem;
}

.dashboard-trend-card--compact .dashboard-trend-card__headline {
  margin-top: 0.3rem;
}

.dashboard-trend-card__headline-value {
  font-size: 1.5rem;
  font-weight: 700;
  line-height: 1.08;
  color: var(--dashboard-text-primary);
  font-variant-numeric: tabular-nums;
}

@media (min-width: 768px) {
  .dashboard-trend-card__headline-value {
    font-size: 1.875rem;
  }
}

.dashboard-trend-card__headline-label {
  font-size: 11px;
  line-height: 1.4;
  color: var(--dashboard-text-muted);
}

.dashboard-trend-card__growth {
  display: inline-flex;
  width: fit-content;
  align-items: center;
  gap: 0.4rem;
  border-radius: 999px;
  padding: 0.55rem 0.85rem;
}

.dashboard-trend-card--compact .dashboard-trend-card__growth {
  gap: 0.35rem;
  padding: 0.38rem 0.68rem;
}

.dashboard-trend-card__growth--positive {
  background: color-mix(in srgb, var(--dashboard-positive-text) 14%, transparent);
  color: var(--dashboard-positive-text);
}

.dashboard-trend-card__growth--negative {
  background: color-mix(in srgb, var(--dashboard-negative-text) 14%, transparent);
  color: var(--dashboard-negative-text);
}

.dashboard-trend-card__growth-value {
  font-size: 13px;
  font-weight: 700;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}

.dashboard-trend-card__growth-label {
  font-size: 10px;
  line-height: 1.2;
  color: var(--dashboard-text-muted);
  white-space: nowrap;
}

.dashboard-trend-card__chart-shell {
  position: relative;
  margin-top: 1rem;
  flex: 0 0 auto;
  min-height: 220px;
}

.dashboard-trend-card--header-divider .dashboard-trend-card__chart-shell {
  margin-top: 0.8rem;
}

.dashboard-trend-card--compact .dashboard-trend-card__chart-shell {
  margin-top: 0.55rem;
  min-height: 112px;
}

.dashboard-trend-card__chart-host,
.dashboard-trend-card__chart-loading {
  height: 100%;
  min-height: 220px;
}

.dashboard-trend-card--compact .dashboard-trend-card__chart-host,
.dashboard-trend-card--compact .dashboard-trend-card__chart-loading {
  min-height: 112px;
}

.dashboard-trend-card__chart {
  height: 100%;
}

.dashboard-trend-card__chart-loading {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  border-radius: 1rem;
  background:
    linear-gradient(180deg, var(--_accent-tint-6), transparent 65%),
    color-mix(in srgb, var(--dashboard-surface-strong) 72%, transparent);
  padding: 1rem 0.4rem 0.8rem;
}

.dashboard-trend-card--compact .dashboard-trend-card__chart-loading {
  padding: 0.65rem 0.2rem 0.45rem;
}

.dashboard-trend-card__chart-bars {
  display: grid;
  width: 100%;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  align-items: end;
  gap: 0.55rem;
}

.dashboard-trend-card__chart-bar {
  width: 100%;
  border-radius: 999px 999px 0 0;
}

.dashboard-trend-card__empty {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  text-align: center;
  pointer-events: none;
}

.dashboard-trend-card__empty p {
  font-size: 13px;
  font-weight: 600;
  color: var(--dashboard-text-primary);
}

.dashboard-trend-card__empty span {
  max-width: 18rem;
  font-size: 11px;
  line-height: 1.5;
  color: var(--dashboard-text-muted);
}

.dashboard-trend-card__months {
  margin-top: 1rem;
  border-top: 1px solid var(--dashboard-divider);
}

.dashboard-trend-card--compact .dashboard-trend-card__months {
  margin-top: 0.65rem;
}

.dashboard-trend-card__month-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

@media (min-width: 640px) {
  .dashboard-trend-card__month-grid {
    grid-template-columns: repeat(6, minmax(0, 1fr));
  }
}

.dashboard-trend-card__month {
  min-height: 78px;
  padding: 0.85rem 0.7rem 0.8rem;
  transition: background-color 220ms ease;
}

.dashboard-trend-card--compact .dashboard-trend-card__month {
  min-height: 60px;
  padding: 0.5rem 0.5rem 0.48rem;
}

.dashboard-trend-card__month:not(:first-child) {
  border-left: 1px solid var(--dashboard-divider);
}

.dashboard-trend-card__month:hover {
  background: var(--_accent-tint-6);
}

.dashboard-trend-card__month-label {
  font-size: 10px;
  font-weight: 500;
  line-height: 1.3;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--dashboard-text-muted);
}

.dashboard-trend-card__month-value {
  margin-top: 0.35rem;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.3;
  color: var(--_accent);
  font-variant-numeric: tabular-nums;
}

.dashboard-trend-card--compact .dashboard-trend-card__month-value {
  margin-top: 0.15rem;
}

.dashboard-trend-card__month-meta {
  margin-top: 0.2rem;
  font-size: 10px;
  line-height: 1.35;
  color: var(--dashboard-text-muted);
}

.dashboard-trend-card--compact .dashboard-trend-card__month-meta {
  margin-top: 0.05rem;
}

.dashboard-trend-card__month-empty {
  margin-top: 0.55rem;
  font-size: 10px;
  font-style: italic;
  line-height: 1.45;
  color: var(--dashboard-text-soft);
}

.dashboard-trend-card__loading-copy {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.dashboard-trend-card__loading-line {
  display: block;
  height: 0.75rem;
}

.dashboard-trend-card__loading-line--title {
  width: 8rem;
}

.dashboard-trend-card__loading-line--subtitle {
  width: 10.5rem;
}

.dashboard-trend-card__growth-skeleton {
  height: 2.25rem;
  width: 7.5rem;
}

.dashboard-trend-card__month--loading {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.dashboard-trend-card__month-loading {
  display: block;
  height: 0.65rem;
}

.dashboard-trend-card__month-loading--label {
  width: 2.25rem;
}

.dashboard-trend-card__month-loading--value {
  width: 3.6rem;
}

.dashboard-trend-card__month-loading--meta {
  width: 4.2rem;
}

:deep(.unovis-xy-container) {
  --vis-crosshair-line-stroke-color: var(--_accent);
  --vis-crosshair-line-stroke-opacity: 0.2;
  --vis-crosshair-circle-stroke-color: var(--dashboard-surface-strong);
  --vis-crosshair-circle-fill-color: var(--_accent);
  --vis-crosshair-circle-stroke-width: 2px;
  --vis-axis-grid-color: var(--dashboard-chart-grid);
  --vis-axis-tick-color: transparent;
  --vis-axis-tick-label-color: var(--dashboard-text-soft);
  --vis-tooltip-background-color: var(--dashboard-chart-tooltip-bg);
  --vis-tooltip-border-color: var(--dashboard-chart-tooltip-border);
  --vis-tooltip-text-color: var(--dashboard-chart-tooltip-text);
}

:deep(.unovis-tooltip) {
  border-radius: 0.875rem;
  box-shadow: 0 18px 40px -26px rgba(0, 0, 0, 0.45);
  font-size: 11px;
  line-height: 1.45;
  padding: 0.55rem 0.7rem;
}

:deep(.unovis-crosshair-circle) {
  r: 4;
}

@media (prefers-reduced-motion: reduce) {
  .dashboard-trend-card__month {
    transition: none;
  }
}
</style>
