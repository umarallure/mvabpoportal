import './assets/css/main.css'

import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import ui from '@nuxt/ui/vue-plugin'
import App from './App.vue'
import { useAuth } from './composables/useAuth'

const app = createApp(App)

const router = createRouter({
  routes: [
    { path: '/', component: () => import('./pages/index.vue'), meta: { public: true } },
    { path: '/login', component: () => import('./pages/login.vue'), meta: { public: true } },
    { path: '/get-started', component: () => import('./pages/get-started.vue') },
    { path: '/dashboard', component: () => import('./pages/dashboard.vue') },
    { path: '/inbox', component: () => import('./pages/inbox.vue') },
    { path: '/transfers', component: () => import('./pages/transfers.vue') },
    { path: '/retainers', component: () => import('./pages/retainers.vue') },
    { path: '/retainers/:id', component: () => import('./pages/retainers-details.vue') },
    { path: '/invoicing', component: () => import('./pages/invoicing.vue') },
    { path: '/sales-map', component: () => import('./pages/sales-map.vue') },
    { path: '/submission-portal', component: () => import('./pages/submission-portal.vue') },
    { path: '/users', component: () => import('./pages/users.vue'), meta: { requiresSuperAdmin: true } },
    { path: '/product-guide', component: () => import('./pages/product-guide.vue'), meta: { requiresAdminOrSuperAdmin: true } },
    {
      path: '/settings',
      component: () => import('./pages/settings.vue'),
      children: [
        { path: '', component: () => import('./pages/settings/index.vue') },
        { path: 'bpo-profile', component: () => import('./pages/settings/bpo-profile.vue') },
        { path: 'sales-map-admin', component: () => import('./pages/settings/sales-map-admin.vue') },
        { path: 'export-sheets', component: () => import('./pages/settings/export-sheets.vue') }
      ]
    }
  ],
  history: createWebHistory()
})

router.beforeEach(async (to) => {
  const auth = useAuth()

  await auth.init()

  const isPublic = Boolean(to.meta.public)
  const isLoggedIn = Boolean(auth.state.value.user)
  const requiresAdmin = Boolean(to.meta.requiresAdmin)
  const requiresSuperAdmin = Boolean(to.meta.requiresSuperAdmin)
  const requiresAdminOrSuperAdmin = Boolean(to.meta.requiresAdminOrSuperAdmin)
  const isAdmin = auth.state.value.profile?.role === 'admin'
  const isSuperAdmin = auth.state.value.profile?.role === 'super_admin'
  const isLawyer = auth.state.value.profile?.role === 'lawyer'
  const hasCenter = isSuperAdmin || isAdmin || Boolean(auth.state.value.profile?.center_id)

  if (isLoggedIn && isLawyer) {
    try {
      await auth.signOut()
    } catch {
      // ignore sign-out errors; still block access
    }

    if (to.path !== '/login') {
      return { path: '/login', query: { reason: 'lawyer' } }
    }
  }

  if (isPublic) return true

  if (isLoggedIn && !hasCenter) {
    return { path: '/get-started', query: { redirect: to.fullPath } }
  }

  if (requiresAdmin) {
    if (!isLoggedIn) {
      return { path: '/login', query: { redirect: to.fullPath } }
    }

    if (!isAdmin) {
      return { path: '/dashboard' }
    }

    return true
  }

  if (requiresSuperAdmin) {
    if (!isLoggedIn) {
      return { path: '/login', query: { redirect: to.fullPath } }
    }

    if (!isSuperAdmin) {
      return { path: '/dashboard' }
    }

    return true
  }

  if (requiresAdminOrSuperAdmin) {
    if (!isLoggedIn) {
      return { path: '/login', query: { redirect: to.fullPath } }
    }

    if (!isAdmin && !isSuperAdmin) {
      return { path: '/dashboard' }
    }

    return true
  }

  if (isLoggedIn) return true

  return { path: '/login', query: { redirect: to.fullPath } }
})

app.use(router)

app.use(ui)

app.mount('#app')
