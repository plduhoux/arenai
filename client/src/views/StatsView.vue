<template>
  <div class="stats-view">
    <h1>Statistics</h1>
    <div v-if="loading" class="loading">Loading stats...</div>
    <div v-else-if="!stats?.totals?.total" class="empty-state">
      <p>No finished games yet. Start playing!</p>
    </div>
    <div v-else class="stats-grid">
      <!-- Total Games -->
      <div class="stat-card">
        <h3>Total Games</h3>
        <div class="big-number">{{ stats.totals.total }}</div>
      </div>

      <!-- Win Rate -->
      <div class="stat-card">
        <h3>Win Rate</h3>
        <div class="win-rate-row">
          <span class="liberal">Liberal {{ libPct }}%</span>
          <span class="fascist">Fascist {{ 100 - libPct }}%</span>
        </div>
        <div class="win-bar">
          <div class="liberal-fill" :style="{ width: libPct + '%' }" />
        </div>
        <div class="win-counts">
          {{ stats.totals.liberal_wins }} liberal / {{ stats.totals.fascist_wins }} fascist
        </div>
      </div>

      <!-- Averages -->
      <div class="stat-card">
        <h3>Averages</h3>
        <div class="stat-row">
          <span>Rounds per game</span>
          <span>{{ (stats.totals.avg_rounds || 0).toFixed(1) }}</span>
        </div>
        <div class="stat-row">
          <span>Liberal policies</span>
          <span class="liberal">{{ (stats.totals.avg_liberal_policies || 0).toFixed(1) }}</span>
        </div>
        <div class="stat-row">
          <span>Fascist policies</span>
          <span class="fascist">{{ (stats.totals.avg_fascist_policies || 0).toFixed(1) }}</span>
        </div>
      </div>

      <!-- Win Reasons -->
      <div v-if="stats.byReason?.length" class="stat-card">
        <h3>Win Reasons</h3>
        <div v-for="r in stats.byReason" :key="r.win_reason" class="stat-row">
          <span>{{ reasonLabel(r.win_reason) }}</span>
          <span>{{ r.count }}</span>
        </div>
      </div>

      <!-- By Model -->
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
              <th>As Liberal</th>
              <th>Lib Wins</th>
              <th>As Fascist</th>
              <th>Fas Wins</th>
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
              <td>{{ m.asLiberal }}</td>
              <td class="liberal">{{ m.libWins }}</td>
              <td>{{ m.asFascist }}</td>
              <td class="fascist">{{ m.fasWins }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { fetchStats } from '../composables/useApi'
import { shortModel, winReasonLabel } from '../utils/format'

const stats = ref(null)
const loading = ref(true)

const libPct = computed(() => {
  const t = stats.value?.totals
  return t?.total > 0 ? Math.round((t.liberal_wins / t.total) * 100) : 0
})

function reasonLabel(reason) {
  return winReasonLabel(reason)
}

function winPct(m) {
  return m.played > 0 ? Math.round((m.wins / m.played) * 100) : 0
}

onMounted(async () => {
  try {
    stats.value = await fetchStats()
  } catch {}
  loading.value = false
})
</script>
