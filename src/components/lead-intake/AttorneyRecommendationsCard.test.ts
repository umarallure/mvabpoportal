/* eslint-disable vue/one-component-per-file -- Local component stubs keep this focused test self-contained. */
import { defineComponent, nextTick, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AttorneyRecommendationsCard from './AttorneyRecommendationsCard.vue'
import type { AttorneyOption } from './retainer-types'

const mocks = vi.hoisted(() => ({
  invoke: vi.fn()
}))

vi.mock('../../lib/supabase', () => ({
  supabase: {
    functions: { invoke: mocks.invoke }
  }
}))

const stubs = {
  UBadge: defineComponent({ template: '<span><slot /></span>' }),
  UIcon: defineComponent({ template: '<span />' })
}

const baseProps = {
  customerState: 'FL',
  accidentDate: '2026-07-01',
  dateOfBirth: '1990-01-01',
  documents: { policeReport: false, insuranceDocuments: false, medicalTreatmentProof: false, driverLicense: false },
  locked: false
}

const optionsResponse = {
  attorneys: [{
    id: 'attorney-1', displayName: 'Preferred Law Group', selectable: true,
    qualification: 'qualified', reasons: ['Open order for FL'],
    templates: [{ id: 'mapping-1', name: 'Florida Adult Retainer', type: 'adult', stateCode: 'FL', isDefault: true, priority: 10 }]
  }, {
    id: 'requirement-ready', displayName: 'Alternate Law Group', selectable: true,
    qualification: 'qualified', reasons: ['Requirement matches FL and SOL'],
    templates: [{ id: 'mapping-2', name: 'General Retainer', type: 'adult', stateCode: null, isDefault: true, priority: 20 }]
  }, {
    id: 'requirement-1', displayName: 'Near Match Firm', selectable: false,
    qualification: 'missing_documents', reasons: ['Police report required'], templates: []
  }]
}

const mountHarness = (overrides: Partial<typeof baseProps> = {}) => {
  const selectedId = ref('')
  const selectedAttorney = ref<AttorneyOption | null>(null)
  const props = reactiveProps(overrides)
  const Harness = defineComponent({
    components: { AttorneyRecommendationsCard },
    setup: () => ({ selectedId, selectedAttorney, props }),
    template: `<AttorneyRecommendationsCard
      v-model="selectedId"
      v-bind="props"
      @update:selected-attorney="selectedAttorney = $event"
    />`
  })
  const wrapper = mount(Harness, { global: { components: stubs } })
  return { wrapper, selectedId, selectedAttorney, props }
}

const reactiveProps = (overrides: Partial<typeof baseProps>) => ref({ ...baseProps, ...overrides })

const runOptionsTimer = async () => {
  await vi.advanceTimersByTimeAsync(400)
  await nextTick()
}

describe('attorney recommendations card', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mocks.invoke.mockReset()
    mocks.invoke.mockResolvedValue({ data: optionsResponse, error: null })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows one flattened ranked list, blocks document near-matches, and invalidates on state changes', async () => {
    const { wrapper, selectedId, selectedAttorney, props } = mountHarness()
    await runOptionsTimer()

    const attorneyCards = wrapper.findAll('[data-testid="attorney-option"]')
    expect(attorneyCards).toHaveLength(2)
    expect(attorneyCards[0].text()).toContain('Preferred Law Group')
    expect(attorneyCards[0].text()).toContain('Recommended')
    expect(attorneyCards[1].text()).toContain('Alternate Law Group')
    expect(wrapper.text()).not.toContain('Internal attorney')
    expect(wrapper.text()).not.toContain('Broker attorney')
    expect(wrapper.text()).toContain('Near Match Firm')
    expect(wrapper.text()).toContain('Police report required')

    expect(selectedId.value).toBe('attorney-1')
    expect(selectedAttorney.value?.displayName).toBe('Preferred Law Group')

    props.value = { ...props.value, customerState: 'GA' }
    await nextTick()
    await runOptionsTimer()
    expect(mocks.invoke).toHaveBeenCalledTimes(2)
    expect(mocks.invoke.mock.calls[1][1].body.state).toBe('GA')
  })

  it('freezes the list and selection while locked, and reloads when unlocked', async () => {
    const { wrapper, selectedId, props } = mountHarness()
    await runOptionsTimer()
    expect(selectedId.value).toBe('attorney-1')

    props.value = { ...props.value, locked: true }
    await nextTick()
    props.value = { ...props.value, customerState: 'GA' }
    await nextTick()
    await runOptionsTimer()
    expect(mocks.invoke).toHaveBeenCalledTimes(1)
    expect(selectedId.value).toBe('attorney-1')
    expect(wrapper.text()).toContain('locked while a retainer envelope is active')

    props.value = { ...props.value, locked: false }
    await nextTick()
    await runOptionsTimer()
    expect(mocks.invoke).toHaveBeenCalledTimes(2)
  })

  it('discards an in-flight options response that resolves after locking', async () => {
    let resolveFetch: (value: { data: unknown, error: null }) => void = () => {}
    mocks.invoke.mockReturnValue(new Promise(resolve => { resolveFetch = resolve }))
    const { wrapper, selectedId, props } = mountHarness()
    await vi.advanceTimersByTimeAsync(400)
    expect(mocks.invoke).toHaveBeenCalledTimes(1)

    props.value = { ...props.value, locked: true }
    await nextTick()
    resolveFetch({ data: optionsResponse, error: null })
    await vi.advanceTimersByTimeAsync(0)
    await nextTick()

    expect(selectedId.value).toBe('')
    expect(wrapper.findAll('[data-testid="attorney-option"]')).toHaveLength(0)
  })

  it('keeps a manually selected attorney across refetches when it is still eligible', async () => {
    const { selectedId, props } = mountHarness()
    await runOptionsTimer()
    selectedId.value = 'requirement-ready'
    await nextTick()

    props.value = { ...props.value, customerState: 'GA' }
    await nextTick()
    await runOptionsTimer()
    expect(selectedId.value).toBe('requirement-ready')
  })
})
