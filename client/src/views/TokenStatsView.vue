<template>
  <div class="token-stats-view">
    <h1>Token Usage</h1>
    <div v-if="loading" class="loading">Loading token data...</div>
    <div v-else-if="!data?.models?.length" class="empty-state">
      <p>No token data yet. Play some games!</p>
    </div>
    <template v-else>
      <div class="elo-tabs">
        <button
          class="elo-tab"
          :class="{ active: activeTab === 'all' }"
          @click="activeTab = 'all'"
        >All Games</button>
        <button
          v-for="gt in data.gameTypes"
          :key="gt"
          class="elo-tab"
          :class="{ active: activeTab === gt }"
          @click="activeTab = gt"
        >{{ gameTypeLabel(gt) }}</button>
      </div>

      <!-- Global overview -->
      <div class="totals-bar" v-if="currentData">
        <div class="total-item">
          <span class="total-label">Total tokens</span>
          <span class="total-value">{{ fmt(currentData.totals.total) }}</span>
        </div>
        <div class="total-item">
          <span class="total-label">Input</span>
          <span class="total-value">{{ fmt(currentData.totals.input) }}</span>
        </div>
        <div class="total-item">
          <span class="total-label">Output</span>
          <span class="total-value">{{ fmt(currentData.totals.output) }}</span>
        </div>
        <div class="total-item">
          <span class="total-label">Cache read</span>
          <span class="total-value">{{ fmt(currentData.totals.cacheRead) }}</span>
        </div>
      </div>

      <!-- Per-model table -->
      <div class="stat-card wide-card" v-if="currentData">
        <h3>By Model</h3>
        <table class="token-table">
          <thead>
            <tr>
              <th>Model</th>
              <th class="right">Games</th>
              <th class="right">Input</th>
              <th class="right">Output</th>
              <th class="right">Cache</th>
              <th class="right">Total</th>
              <th class="right">Avg/game</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="m in currentData.models" :key="m.model">
              <td class="model-name">{{ shortModel(m.model) }}</td>
              <td class="right">{{ m.games }}</td>
              <td class="right">{{ fmt(m.input) }}</td>
              <td class="right">{{ fmt(m.output) }}</td>
              <td class="right">{{ fmt(m.cacheRead) }}</td>
              <td class="right total-col">{{ fmt(m.total) }}</td>
              <td class="right avg-col">{{ fmt(m.avgTotal) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Per-game breakdown -->
      <div class="stat-card wide-card" v-if="currentData">
        <h3>Per Game</h3>
        <table class="token-table game-table">
          <thead>
            <tr>
              <th>Game</th>
              <th>Type</th>
              <th class="right">Input</th>
              <th class="right">Output</th>
              <th class="right">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="g in currentGames" :key="g.id" @click="$router.push(`/game/${g.id}`)" class="clickable">
              <td>
                <span class="game-models">
                  {{ Object.keys(g.models).map(shortModel).join(' vs ') || '?' }}
                </span>
                <span class="game-date">{{ formatDate(g.created_at) }}</span>
              </td>
              <td class="type-cell">{{ gameTypeLabel(g.game_type) }}</td>
              <td class="right">{{ fmt(gameInput(g)) }}</td>
              <td class="right">{{ fmt(gameOutput(g)) }}</td>
              <td class="right total-col">{{ fmt(gameInput(g) + gameOutput(g)) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { formatTokens as fmt, shortModel, formatDate } from '../utils/format.js'

const GAME_TYPE_LABELS = {
  'secret-dictator': 'Secret Dictator',
  'werewolf': 'Werewolf',
  'two-rooms': 'Two Rooms',
}

const data = ref(null)
const loading = ref(true)
const activeTab = ref('all')

function gameTypeLabel(type) {
  return GAME_TYPE_LABELS[type] || type
}

function gameInput(g) {
  return Object.values(g.models).reduce((s, m) => s + (m.input || 0), 0)
}

function gameOutput(g) {
  return Object.values(g.models).reduce((s, m) => s + (m.output || 0), 0)
}

const currentData = computed(() => {
  if (!data.value) return null
  if (activeTab.value === 'all') return data.value
  return data.value.byGame?.[activeTab.value] || null
})

const currentGames = computed(() => {
  if (!currentData.value?.games) return []
  if (activeTab.value === 'all') return currentData.value.games
  return currentData.value.games.filter(g => g.game_type === activeTab.value)
})

onMounted(async () => {
  try {
    const res = await fetch('/api/token-stats')
    data.value = await res.json()
  } catch {}
  loading.value = false
})
</script>

<style>
.token-stats-view h1 {
  margin-bottom: 1rem;
}

.totals-bar {
  display: flex;
  gap: 1.5rem;
  margin-bottom: 1.5rem;
  padding: 0.75rem 1rem;
  background: var(--bg-secondary);
  border-radius: 6px;
  border: 1px solid var(--border);
}

.total-item {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.total-label {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-secondary);
}

.total-value {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text-primary);
}

.token-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.token-table th {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-secondary);
  padding: 0.4rem 0.6rem;
  border-bottom: 2px solid var(--border);
  white-space: nowrap;
}

.token-table td {
  padding: 0.45rem 0.6rem;
  border-bottom: 1px solid var(--border);
}

.token-table .right {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.token-table .model-name {
  font-weight: 500;
}

.token-table .total-col {
  font-weight: 600;
}

.token-table .avg-col {
  color: var(--text-secondary);
}

.game-table .clickable {
  cursor: pointer;
}

.game-table .clickable:hover td {
  background: var(--bg-secondary);
}

.game-models {
  font-weight: 500;
  display: block;
}

.game-date {
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.type-cell {
  font-size: 0.8rem;
  color: var(--text-secondary);
}
</style>
