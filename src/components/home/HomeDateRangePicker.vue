<script setup lang="ts">
import { computed } from 'vue'
import { DateFormatter, getLocalTimeZone, CalendarDate, today } from '@internationalized/date'
import type { Range } from '../../types'

const df = new DateFormatter('en-US', {
  dateStyle: 'medium'
})

const selected = defineModel<Range>({ required: true })

type PresetRange = {
  label: string
  mode: 'today' | 'yesterday' | 'days' | 'months' | 'years'
  amount?: number
}

const ranges = [
  { label: 'Today', mode: 'today' },
  { label: 'Yesterday', mode: 'yesterday' },
  { label: 'Last 7 days', mode: 'days', amount: 6 },
  { label: 'Last 14 days', mode: 'days', amount: 13 },
  { label: 'Last 30 days', mode: 'days', amount: 29 },
  { label: 'Last 3 months', mode: 'months', amount: 3 },
  { label: 'Last 6 months', mode: 'months', amount: 6 },
  { label: 'Last year', mode: 'years', amount: 1 }
] satisfies PresetRange[]

const toCalendarDate = (date: Date) => {
  return new CalendarDate(
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate()
  )
}

const resolvePresetRange = (range: PresetRange) => {
  const currentDate = today(getLocalTimeZone())

  if (range.mode === 'today') {
    return {
      start: currentDate,
      end: currentDate
    }
  }

  if (range.mode === 'yesterday') {
    const yesterday = currentDate.subtract({ days: 1 })
    return {
      start: yesterday,
      end: yesterday
    }
  }

  let startDate = currentDate.copy()

  if (range.mode === 'days') {
    startDate = startDate.subtract({ days: range.amount ?? 0 })
  } else if (range.mode === 'months') {
    startDate = startDate.subtract({ months: range.amount ?? 0 })
  } else if (range.mode === 'years') {
    startDate = startDate.subtract({ years: range.amount ?? 0 })
  }

  return {
    start: startDate,
    end: currentDate
  }
}

const calendarRange = computed({
  get: () => ({
    start: selected.value.start ? toCalendarDate(selected.value.start) : undefined,
    end: selected.value.end ? toCalendarDate(selected.value.end) : undefined
  }),
  set: (newValue: { start: CalendarDate | undefined, end: CalendarDate | undefined }) => {
    selected.value = {
      start: newValue.start ? newValue.start.toDate(getLocalTimeZone()) : new Date(),
      end: newValue.end ? newValue.end.toDate(getLocalTimeZone()) : new Date()
    }
  }
})

const isRangeSelected = (range: PresetRange) => {
  if (!selected.value.start || !selected.value.end) return false

  const resolved = resolvePresetRange(range)

  const selectedStart = toCalendarDate(selected.value.start)
  const selectedEnd = toCalendarDate(selected.value.end)

  return selectedStart.compare(resolved.start) === 0 && selectedEnd.compare(resolved.end) === 0
}

const selectRange = (range: PresetRange) => {
  const resolved = resolvePresetRange(range)

  selected.value = {
    start: resolved.start.toDate(getLocalTimeZone()),
    end: resolved.end.toDate(getLocalTimeZone())
  }
}
</script>

<template>
  <UPopover :content="{ align: 'start' }" :modal="true">
    <UButton
      color="neutral"
      variant="ghost"
      icon="i-lucide-calendar"
      class="data-[state=open]:bg-elevated group"
    >
      <span class="truncate">
        <template v-if="selected.start">
          <template v-if="selected.end">
            {{ df.format(selected.start) }} - {{ df.format(selected.end) }}
          </template>
          <template v-else>
            {{ df.format(selected.start) }}
          </template>
        </template>
        <template v-else>
          Pick a date
        </template>
      </span>

      <template #trailing>
        <UIcon name="i-lucide-chevron-down" class="shrink-0 text-dimmed size-5 group-data-[state=open]:rotate-180 transition-transform duration-200" />
      </template>
    </UButton>

    <template #content>
      <div class="flex items-stretch sm:divide-x divide-default">
        <div class="hidden sm:flex flex-col justify-center">
          <UButton
            v-for="(range, index) in ranges"
            :key="index"
            :label="range.label"
            color="neutral"
            variant="ghost"
            class="rounded-none px-4"
            :class="[isRangeSelected(range) ? 'bg-elevated' : 'hover:bg-elevated/50']"
            truncate
            @click="selectRange(range)"
          />
        </div>

        <UCalendar
          v-model="calendarRange"
          class="p-2"
          :number-of-months="2"
          range
        />
      </div>
    </template>
  </UPopover>
</template>
