<template>
  <div class="elo-view">
    <h1>ELO Rankings</h1>
    <div v-if="loading" class="loading">Loading ELO data...</div>
    <div v-else-if="!elo?.overall?.length" class="empty-state">
      <p>No ELO data yet. Play some games!</p>
    </div>
    <template v-else>
      <div class="elo-tabs">
        <button
          class="elo-tab"
          :class="{ active: activeTab === 'all' }"
          @click="activeTab = 'all'"
        >All Games</button>
        <button
          v-for="gt in elo.gameTypes"
          :key="gt"
          class="elo-tab"
          :class="{ active: activeTab === gt }"
          @click="activeTab = gt"
        >{{ gameTypeLabel(gt) }}</button>
      </div>

      <div class="stats-grid" v-if="currentData">
        <div class="stat-card wide-card">
          <h3>Overall</h3>
          <EloTable :rows="currentData.overall" />
        </div>

        <div v-if="currentData.good?.length" class="stat-card">
          <h3>Good Side</h3>
          <EloTable :rows="currentData.good" />
        </div>

        <div v-if="currentData.evil?.length" class="stat-card">
          <h3>Evil Side</h3>
          <EloTable :rows="currentData.evil" />
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import EloTable from '../components/EloTable.vue'

const GAME_TYPE_LABELS = {
  'secret-dictator': 'Secret Dictator',
  'werewolf': 'Werewolf',
  'two-rooms': 'Two Rooms',
}

const elo = ref(null)
const loading = ref(true)
const activeTab = ref('all')

function gameTypeLabel(type) {
  return GAME_TYPE_LABELS[type] || type
}

const currentData = computed(() => {
  if (!elo.value) return null
  if (activeTab.value === 'all') {
    return {
      overall: elo.value.overall,
      good: elo.value.byRole?.good,
      evil: elo.value.byRole?.evil,
    }
  }
  return elo.value.byGame?.[activeTab.value] || null
})

onMounted(async () => {
  try {
    const res = await fetch('/api/elo')
    elo.value = await res.json()
  } catch {}
  loading.value = false
})
</script>

<style>
.elo-tabs {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
}
.elo-tab {
  padding: 0.4rem 0.8rem;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 0.85rem;
}
.elo-tab.active {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}
</style>
