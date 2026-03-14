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
  },
  {
    path: '/elo',
    name: 'elo',
    component: () => import('../views/EloView.vue'),
  },
  {
    path: '/tokens',
    name: 'tokens',
    component: () => import('../views/TokenStatsView.vue'),
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
