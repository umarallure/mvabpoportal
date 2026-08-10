<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import { useAuth } from '../../composables/useAuth'
import { useTermsGate } from '../../composables/useTermsGate'
import { renderTermsMarkdown, TERMS_VERSION_CHANGED, type TermsVersion } from '../../lib/terms'

const props = defineProps<{ terms: TermsVersion }>()

const toast = useToast()
const router = useRouter()
const auth = useAuth()
const termsGate = useTermsGate()

const contentEl = ref<HTMLElement | null>(null)
const hasReadToEnd = ref(false)
const agreed = ref(false)
const typedName = ref('')
const signingOut = ref(false)

const accepting = computed(() => termsGate.state.value.accepting)
const contentHtml = computed(() => renderTermsMarkdown(props.terms.content_md))
const effectiveDate = computed(() =>
  new Date(props.terms.effective_at).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
)

const canAccept = computed(() =>
  hasReadToEnd.value &&
  agreed.value &&
  typedName.value.trim().length >= 2 &&
  !accepting.value
)

const checkReadToEnd = () => {
  const el = contentEl.value
  if (!el) return
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) {
    hasReadToEnd.value = true
  }
}

onMounted(async () => {
  await nextTick()
  checkReadToEnd()
  window.addEventListener('resize', checkReadToEnd)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', checkReadToEnd)
})

// A reload (e.g. after a mid-session republish) swaps the terms text, so the
// user has to read and agree to the new version from scratch.
watch(
  () => props.terms.id,
  async () => {
    hasReadToEnd.value = false
    agreed.value = false
    if (contentEl.value) contentEl.value.scrollTop = 0
    await nextTick()
    checkReadToEnd()
  }
)

const submit = async () => {
  if (!canAccept.value) return

  try {
    await termsGate.accept(typedName.value.trim())
    toast.add({
      title: 'Agreement accepted',
      description: 'Thank you — you now have full access to the portal.',
      color: 'success'
    })
  } catch (error) {
    if (error instanceof Error && error.message === TERMS_VERSION_CHANGED) {
      toast.add({
        title: 'Agreement was updated',
        description: 'The agreement changed while you were reading. Please review the latest version.',
        color: 'warning'
      })
      await termsGate.reload()
      return
    }

    toast.add({
      title: 'Could not record your acceptance',
      description: error instanceof Error ? error.message : 'Please try again.',
      color: 'error'
    })
  }
}

const handleSignOut = async () => {
  signingOut.value = true
  try {
    await auth.signOut()
  } catch (error) {
    console.warn('[terms] sign out failed', error)
  } finally {
    signingOut.value = false
  }
  termsGate.clear()
  router.replace('/login')
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-[var(--ap-bg)] p-4 sm:p-6">
    <div class="flex h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-default bg-default shadow-xl">
      <div class="border-b border-default px-6 py-5">
        <div class="flex items-center gap-3">
          <UIcon name="i-lucide-scroll-text" class="size-6 text-primary" />
          <div>
            <h1 class="text-lg font-semibold text-highlighted">{{ terms.title }}</h1>
            <p class="text-sm text-muted">
              Version {{ terms.version }} · Effective {{ effectiveDate }}
            </p>
          </div>
        </div>
        <p class="mt-3 text-sm text-muted">
          Please review and accept the agreement below to continue using the portal.
        </p>
      </div>

      <div
        ref="contentEl"
        class="terms-body min-h-0 flex-1 overflow-y-auto px-6 py-5"
        @scroll.passive="checkReadToEnd"
      >
        <!-- eslint-disable-next-line vue/no-v-html — output is escaped in renderTermsMarkdown -->
        <div v-html="contentHtml" />
      </div>

      <div class="border-t border-default bg-elevated/25 px-6 py-4">
        <p v-if="!hasReadToEnd" class="mb-3 flex items-center gap-2 text-xs text-muted">
          <UIcon name="i-lucide-arrow-down" class="size-3.5" />
          Scroll to the end of the agreement to enable acceptance.
        </p>

        <div class="flex flex-col gap-3">
          <UCheckbox
            v-model="agreed"
            :disabled="!hasReadToEnd || accepting"
            label="I have read and agree to this Agreement"
          />

          <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
            <UInput
              v-model="typedName"
              :disabled="!hasReadToEnd || accepting"
              placeholder="Type your full legal name to sign"
              icon="i-lucide-pen-line"
              class="flex-1"
              autocomplete="name"
            />
            <UButton
              :disabled="!canAccept"
              :loading="accepting"
              color="primary"
              icon="i-lucide-check"
              @click="submit"
            >
              Accept & Continue
            </UButton>
          </div>

          <div class="flex items-center justify-between text-xs text-muted">
            <span>
              Your acceptance is recorded with your account, the date, and the exact version you signed.
            </span>
            <UButton
              variant="link"
              color="neutral"
              size="xs"
              :loading="signingOut"
              @click="handleSignOut"
            >
              Sign out
            </UButton>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Theme-aware legal typography (the shared .ap-legal styles assume the
   always-dark public pages, so the in-app gate uses Nuxt UI tokens). */
.terms-body {
  color: var(--ui-text-muted);
  font-size: 0.9375rem;
  line-height: 1.7;
}

.terms-body :deep(h2),
.terms-body :deep(h3),
.terms-body :deep(h4) {
  color: var(--ui-text-highlighted);
  font-weight: 600;
  font-size: 1.05rem;
  letter-spacing: -0.01em;
  margin: 2rem 0 0.5rem;
}

.terms-body :deep(h2:first-child) {
  margin-top: 0;
}

.terms-body :deep(p) {
  margin: 0 0 0.75rem;
}

.terms-body :deep(ul) {
  margin: 0 0 0.75rem;
  padding-left: 1.15rem;
  list-style: disc;
}

.terms-body :deep(li) {
  margin-bottom: 0.4rem;
}

.terms-body :deep(a) {
  color: var(--ui-primary);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.terms-body :deep(strong) {
  color: var(--ui-text-highlighted);
  font-weight: 600;
}
</style>
