import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PartnerDisclosureCard from './PartnerDisclosureCard.vue'

const stubs = {
  UIcon: defineComponent({ template: '<span />' })
}

describe('partner law firm disclosure card', () => {
  it('interpolates the selected firm into the read-to-caller script', () => {
    const wrapper = mount(PartnerDisclosureCard, {
      props: { attorneyName: 'Preferred Law Group' },
      global: { components: stubs }
    })
    expect(wrapper.text()).toContain('Partner Law Firm Disclosure')
    expect(wrapper.text()).toContain('Verbal agreement required')
    expect(wrapper.text()).toContain('the law firm we are partnering you with is Preferred Law Group')
    expect(wrapper.text()).toContain('Accident Claims Helpline is not the law firm')
    expect(wrapper.text()).toContain('Do you agree to be connected with Preferred Law Group')
    expect(wrapper.text()).toContain('Get a clear verbal YES')
  })

  it('falls back to placeholder wording when no attorney is selected', () => {
    const wrapper = mount(PartnerDisclosureCard, {
      props: { attorneyName: null },
      global: { components: stubs }
    })
    expect(wrapper.text()).toContain('I want to confirm the law firm we are partnering you with for this matter')
    expect(wrapper.text()).toContain('connected with the selected law firm')
  })
})
