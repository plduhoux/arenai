import { createRouter, createWebHashHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    name: 'dashboard',
    component: () => import('../views/DashboardView.vue'),
  },
  {
    path: '/new',
    name: 'new-game',
    component: () => import('../views/NewGameView.vue'),
  },
  {
    path: '/game/:id',
    name: 'game',
    component: () => import('../views/GameView.vue'),
    props: true,
  },
  {
    path: '/stats',
    name: 'stats',
    component: () => import('../views/StatsView.vue'),
    props: route => ({ section: route.query.section || 'statistics' }),
  },
  {
    path: '/elo',
    redirect: '/stats?section=elo',
  },
  {
    path: '/tokens',
    redirect: '/stats?section=tokens',
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('../views/SettingsView.vue'),
  },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

export default router
