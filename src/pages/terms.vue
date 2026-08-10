<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import LegalPage from '../components/legal/LegalPage.vue'
import { fetchPublicTerms, renderTermsMarkdown, type TermsVersion } from '../lib/terms'

const terms = ref<TermsVersion | null>(null)
const loading = ref(true)
const failed = ref(false)

onMounted(async () => {
  try {
    terms.value = await fetchPublicTerms()
    failed.value = !terms.value
  } catch (error) {
    console.warn('[terms] failed to load public terms', error)
    failed.value = true
  } finally {
    loading.value = false
  }
})

const contentHtml = computed(() =>
  terms.value ? renderTermsMarkdown(terms.value.content_md) : ''
)

const lastUpdated = computed(() =>
  terms.value
    ? new Date(terms.value.effective_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })
    : '—'
)
</script>

<template>
  <LegalPage :title="terms?.title ?? 'Terms & Conditions'" :last-updated="lastUpdated">
    <p v-if="loading">Loading…</p>
    <p v-else-if="failed">
      The terms are temporarily unavailable. Please try again later.
    </p>
    <!-- eslint-disable-next-line vue/no-v-html — output is escaped in renderTermsMarkdown -->
    <div v-else class="terms-content" v-html="contentHtml" />
  </LegalPage>
</template>

<style scoped>
/* The shared .ap-legal styles expect <section> wrappers for vertical rhythm;
   the rendered markdown emits flat h2/p/ul, so headings space themselves. */
.terms-content :deep(h2),
.terms-content :deep(h3),
.terms-content :deep(h4) {
  margin-top: 2rem;
}

.terms-content :deep(h2:first-child) {
  margin-top: 0;
}
</style>
