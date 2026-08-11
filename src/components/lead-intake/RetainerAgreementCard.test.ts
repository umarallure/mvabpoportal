/* eslint-disable vue/one-component-per-file, vue/require-default-prop -- Local component stubs keep this focused test self-contained. */
import { defineComponent, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import RetainerAgreementCard from './RetainerAgreementCard.vue'
import type { AttorneyOption } from './retainer-types'

const agreementRow = {
  id: 'agreement-1', envelope_id: 'envelope-1', status: 'sent',
  document_bucket: null, document_storage_path: null, document_file_name: null
}

const mocks = vi.hoisted(() => {
  const callbacks = { realtime: null as ((payload: { new: Record<string, unknown> }) => void) | null }
  const invoke = vi.fn()
  const removeChannel = vi.fn()
  const download = vi.fn()
  const query: Record<string, ReturnType<typeof vi.fn>> = {}
  query.select = vi.fn(() => query)
  query.eq = vi.fn(() => query)
  query.single = vi.fn(async () => ({ data: {
    id: 'agreement-1', envelope_id: 'envelope-1', status: 'sent',
    document_bucket: null, document_storage_path: null, document_file_name: null
  }, error: null }))
  const channel: Record<string, ReturnType<typeof vi.fn>> = {}
  channel.on = vi.fn((_event, _filter, callback) => {
    callbacks.realtime = callback
    return channel
  })
  channel.subscribe = vi.fn(() => channel)
  return { callbacks, invoke, removeChannel, download, query, channel }
})

vi.mock('../../lib/supabase', () => ({
  supabase: {
    functions: { invoke: mocks.invoke },
    from: vi.fn(() => mocks.query),
    channel: vi.fn(() => mocks.channel),
    removeChannel: mocks.removeChannel,
    storage: { from: vi.fn(() => ({ download: mocks.download })) }
  }
}))

const UButton = defineComponent({
  props: { disabled: Boolean, loading: Boolean, label: String },
  emits: ['click'],
  template: '<button :disabled="disabled || loading" @click="$emit(\'click\')"><slot />{{ label }}</button>'
})
const UInput = defineComponent({
  props: { modelValue: String, type: String },
  emits: ['update:modelValue'],
  template: '<input :type="type || \'text\'" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)">'
})
const USelect = defineComponent({
  props: { modelValue: String, items: Array, disabled: Boolean },
  emits: ['update:modelValue'],
  template: '<select :disabled="disabled" :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="item in items" :key="item.value" :value="item.value">{{ item.label }}</option></select>'
})
const stubs = {
  UButton,
  UInput,
  USelect,
  UBadge: defineComponent({ template: '<span><slot /></span>' }),
  UIcon: defineComponent({ template: '<span />' })
}

const selectedAttorney: AttorneyOption = {
  id: 'attorney-1', displayName: 'Preferred Law Group', selectable: true,
  qualification: 'qualified', reasons: ['Open order for FL'],
  templates: [{ id: 'mapping-1', name: 'Florida Adult Retainer', type: 'adult', stateCode: 'FL', isDefault: true, priority: 10 }]
}

const baseProps = {
  dncVerified: true,
  submissionId: 'submission-1',
  customerState: 'FL',
  accidentDate: '2026-07-01',
  dateOfBirth: '1990-01-01',
  recipientName: 'Test Client',
  recipientEmail: 'client@example.com',
  recipientPhone: '8505551212',
  clientAddress: '1 Main St, Miami, FL 33101',
  accidentAddress: '2 Ocean Dr, Miami, FL 33139',
  documents: { policeReport: false, insuranceDocuments: false, medicalTreatmentProof: false, driverLicense: false },
  selectedAttorney
}

const mountCard = () => mount(RetainerAgreementCard, { props: baseProps, global: { components: stubs } })

describe('publisher retainer agreement card', () => {
  beforeEach(() => {
    mocks.callbacks.realtime = null
    mocks.invoke.mockReset()
    mocks.invoke.mockResolvedValue({ data: { agreementId: 'agreement-1', envelopeId: 'envelope-1', status: 'sent' }, error: null })
    mocks.download.mockResolvedValue({ data: new Blob(['pdf'], { type: 'application/pdf' }), error: null })
  })

  it('requires a selected attorney before sending', async () => {
    const wrapper = mount(RetainerAgreementCard, {
      props: { ...baseProps, selectedAttorney: null },
      global: { components: stubs }
    })
    expect(wrapper.text()).toContain('Select an attorney in the recommendations above')
    const send = wrapper.findAll('button').find(button => button.text().includes('Send Retainer'))
    expect(send?.attributes('disabled')).toBeDefined()
  })

  it('validates text delivery independently from the prefilled email delivery', async () => {
    const wrapper = mountCard()
    await wrapper.findAll('button').find(button => button.text().includes('Text'))?.trigger('click')
    const phone = wrapper.get('input[type="tel"]')
    await phone.setValue('123')
    expect(wrapper.findAll('button').find(button => button.text().includes('Send Retainer'))?.attributes('disabled')).toBeDefined()
    await phone.setValue('(850) 555-1212')
    expect(wrapper.findAll('button').find(button => button.text().includes('Send Retainer'))?.attributes('disabled')).toBeUndefined()
  })

  it('prefills delivery fields, sends, advances the stepper, follows realtime status, downloads, and cleans up', async () => {
    const wrapper = mountCard()
    expect(wrapper.get('[data-testid="retainer-current-step"]').text()).toBe('Not Sent')
    expect((wrapper.get('input[type="email"]').element as HTMLInputElement).value).toBe('client@example.com')
    expect((wrapper.findAll('input')[0].element as HTMLInputElement).value).toBe('Test Client')
    await wrapper.setProps({ recipientName: 'Updated Client' })
    await nextTick()
    expect((wrapper.findAll('input')[0].element as HTMLInputElement).value).toBe('Updated Client')
    await wrapper.findAll('input')[0].setValue('Manual Signer')
    await wrapper.setProps({ recipientName: 'Later Intake Name' })
    await nextTick()
    expect((wrapper.findAll('input')[0].element as HTMLInputElement).value).toBe('Manual Signer')

    const send = wrapper.findAll('button').find(button => button.text().includes('Send Retainer'))
    expect(send?.attributes('disabled')).toBeUndefined()
    await send?.trigger('click')
    await Promise.resolve()
    await nextTick()
    expect(mocks.invoke).toHaveBeenCalledWith('docusign-send-contract', expect.objectContaining({ body: expect.objectContaining({
      requestId: expect.any(String), submissionId: 'submission-1', templateMappingId: 'mapping-1', attorneyOptionId: 'attorney-1'
    }) }))
    expect(mocks.callbacks.realtime).not.toBeNull()
    const lockedEvents = wrapper.emitted('update:locked') ?? []
    expect(lockedEvents[lockedEvents.length - 1]).toEqual([true])
    await nextTick()
    expect(wrapper.get('[data-testid="retainer-current-step"]').text()).toBe('Sent')

    mocks.callbacks.realtime?.({ new: {
      ...agreementRow, status: 'signed', document_bucket: 'retainer-agreements',
      document_storage_path: 'submission-1/envelope-1/signed.pdf', document_file_name: 'signed.pdf'
    } })
    await nextTick()
    expect(wrapper.get('[data-testid="retainer-current-step"]').text()).toBe('Signed')
    const statusEvents = wrapper.emitted('update:status') ?? []
    expect(statusEvents[statusEvents.length - 1]).toEqual(['signed'])
    expect(wrapper.text()).toContain('Download Signed Retainer')
    await wrapper.findAll('button').find(button => button.text().includes('Download Signed Retainer'))?.trigger('click')
    expect(mocks.download).toHaveBeenCalledWith('submission-1/envelope-1/signed.pdf')
    wrapper.unmount()
    expect(mocks.removeChannel).toHaveBeenCalled()
  })
})
