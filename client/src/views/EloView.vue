<template>
  <div class="elo-view">
    <h1>ELO Rankings</h1>
    <div v-if="loading" class="loading">Loading ELO data...</div>
    <div v-else-if="!elo?.overall?.length" class="empty-state">
      <p>No ELO data yet. Play some games!</p>
    </div>
    <div v-else class="stats-grid">
      <div class="stat-card wide-card">
        <h3>Overall Rankings</h3>
        <EloTable :rows="elo.overall" />
      </div>

      <div v-if="elo.byRole?.good?.length" class="stat-card">
        <h3>Good Side ELO (Liberal / Villager / Blue)</h3>
        <EloTable :rows="elo.byRole.good" />
      </div>

      <div v-if="elo.byRole?.evil?.length" class="stat-card">
        <h3>Evil Side ELO (Fascist / Werewolf / Red)</h3>
        <EloTable :rows="elo.byRole.evil" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import EloTable from '../components/EloTable.vue'

const elo = ref(null)
const loading = ref(true)

onMounted(async () => {
  try {
    const res = await fetch('/api/elo')
    elo.value = await res.json()
  } catch {}
  loading.value = false
})
</script>
