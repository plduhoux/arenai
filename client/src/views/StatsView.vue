<template>
  <div class="stats-view">
    <h1>Statistics</h1>

    <div class="tab-bar" v-if="gameTypes.length > 0">
      <button
        v-for="gt in allTabs" :key="gt.id"
        class="tab-btn" :class="{ active: activeTab === gt.id }"
        @click="switchTab(gt.id)"
      >{{ gt.label }}</button>
    </div>

    <div v-if="loading" class="loading">Loading stats...</div>
    <div v-else-if="!stats?.totals?.total" class="empty-state">
      <p>No finished games yet. Start playing!</p>
    </div>
    <div v-else class="stats-grid">
      <div class="stat-card">
        <h3>Total Games</h3>
        <div class="big-number">{{ stats.totals.total }}</div>
      </div>

      <div class="stat-card">
        <h3>Win Rate</h3>
        <div class="win-rate-row">
          <span class="good">{{ labels.good }} {{ goodPct }}%</span>
          <span class="evil">{{ labels.evil }} {{ 100 - goodPct }}%</span>
        </div>
        <div class="win-bar">
          <div class="good-fill" :style="{ width: goodPct + '%' }" />
        </div>
        <div class="win-counts">
          {{ stats.totals.good_wins }} {{ labels.good.toLowerCase() }} / {{ stats.totals.evil_wins }} {{ labels.evil.toLowerCase() }}
        </div>
      </div>

      <div class="stat-card">
        <h3>Averages</h3>
        <div class="stat-row">
          <span>Rounds per game</span>
          <span>{{ (stats.totals.avg_rounds || 0).toFixed(1) }}</span>
        </div>
      </div>

      <div v-if="stats.byReason?.length" class="stat-card">
        <h3>Win Reasons</h3>
        <div v-for="r in stats.byReason" :key="r.win_reason" class="stat-row">
          <span>{{ winReasonLabel(r.win_reason) }}</span>
          <span>{{ r.count }}</span>
        </div>
      </div>

      <div v-if="stats.byModel?.length" class="stat-card wide-card">
        <h3>By Model</h3>
        <table class="model-table">
          <thead>
            <tr>
              <th>Model</th>
              <th>Played</th>
              <th>Won</th>
              <th>Lost</th>
              <th>Win %</th>
              <th>As {{ labels.good }}</th>
              <th>{{ labels.good }} Wins</th>
              <th>As {{ labels.evil }}</th>
              <th>{{ labels.evil }} Wins</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="m in stats.byModel" :key="m.model">
              <td class="model-name">{{ shortModel(m.model) }}</td>
              <td>{{ m.played }}</td>
              <td class="wins">{{ m.wins }}</td>
              <td class="losses">{{ m.played - m.wins }}</td>
              <td>
                <div class="win-bar-inline">
                  <div class="win-fill" :style="{ width: winPct(m) + '%' }">{{ winPct(m) }}%</div>
                </div>
              </td>
              <td>{{ m.asGood }}</td>
              <td class="good">{{ m.goodWins }}</td>
              <td>{{ m.asEvil }}</td>
              <td class="evil">{{ m.evilWins }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { shortModel, winReasonLabel } from '../utils/format'

const stats = ref(null)
const loading = ref(true)
const activeTab = ref('all')
const gameTypes = ref([])

const GAME_LABELS = {
  'secret-hitler': { good: 'Liberal', evil: 'Fascist' },
  'werewolf': { good: 'Villager', evil: 'Werewolf' },
  'two-rooms': { good: 'Blue', evil: 'Red' },
}

const allTabs = computed(() => {
  const tabs = [{ id: 'all', label: 'All Games' }]
  for (const gt of gameTypes.value) {
    const l = GAME_LABELS[gt] || { good: 'Good', evil: 'Evil' }
    const name = gt === 'secret-hitler' ? 'Secret Hitler' : gt === 'werewolf' ? 'Werewolf' : gt === 'two-rooms' ? 'Two Rooms' : gt
    tabs.push({ id: gt, label: name })
  }
  return tabs
})

const labels = computed(() => {
  if (activeTab.value === 'all') return { good: 'Good', evil: 'Evil' }
  return GAME_LABELS[activeTab.value] || { good: 'Good', evil: 'Evil' }
})

const goodPct = computed(() => {
  const t = stats.value?.totals
  return t?.total > 0 ? Math.round((t.good_wins / t.total) * 100) : 0
})

function winPct(m) {
  return m.played > 0 ? Math.round((m.wins / m.played) * 100) : 0
}

async function loadStats(gameType) {
  loading.value = true
  const params = gameType && gameType !== 'all' ? `?gameType=${gameType}` : ''
  const res = await fetch(`/api/stats${params}`)
  const data = await res.json()
  stats.value = data
  if (data.gameTypes) gameTypes.value = data.gameTypes
  loading.value = false
}

function switchTab(id) {
  activeTab.value = id
  loadStats(id)
}

onMounted(() => loadStats())
</script>
