/* eslint-disable vue/one-component-per-file -- Local component stubs keep this focused test self-contained. */
import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import DocusignSigningScriptCard from './DocusignSigningScriptCard.vue'

const stubs = {
  UIcon: defineComponent({ template: '<span />' }),
  UModal: defineComponent({ template: '<div><slot name="content" /></div>' })
}

describe('docusign signing script card', () => {
  it('renders the seven guide steps with their screenshots', () => {
    const wrapper = mount(DocusignSigningScriptCard, { global: { components: stubs } })
    expect(wrapper.text()).toContain('DocuSign Signing Script')
    const badges = wrapper.findAll('[data-testid="signing-script-step"]')
    expect(badges).toHaveLength(7)
    expect(badges[0].text()).toBe('Step 1')
    expect(badges[6].text()).toBe('Step 7')
    const images = wrapper.findAll('img')
    expect(images).toHaveLength(10)
    const sources = images.map(image => image.attributes('src'))
    for (const step of [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) {
      expect(sources).toContain(`/assets/docusign-guide/step${step}.webp`)
    }
  })
})
