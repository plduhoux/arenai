<template>
  <div class="elo-view">
    <h1>ELO Rankings</h1>
    <div v-if="loading" class="loading">Loading ELO data...</div>
    <div v-else-if="!elo?.overall?.length" class="empty-state">
      <p>No ELO data yet. Play some games!</p>
    </div>
    <div v-else class="stats-grid">
      <!-- Overall -->
      <div class="stat-card">
        <h3>Overall Rankings</h3>
        <EloTable :rows="elo.overall" />
      </div>

      <!-- By Role -->
      <div v-for="role in roles" :key="role.key" class="stat-card">
        <template v-if="elo.byRole[role.key]?.length">
          <h3>
            <span class="icon" :class="role.icon" />
            {{ role.label }} ELO
          </h3>
          <EloTable :rows="elo.byRole[role.key]" />
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { fetchElo } from '../composables/useApi'
import EloTable from '../components/EloTable.vue'

const elo = ref(null)
const loading = ref(true)

const roles = [
  { key: 'liberal', label: 'Liberal', icon: 'icon-liberal' },
  { key: 'fascist', label: 'Fascist', icon: 'icon-fascist' },
  { key: 'hitler', label: 'Dictator', icon: 'icon-hitler' },
]

onMounted(async () => {
  try {
    elo.value = await fetchElo()
  } catch {}
  loading.value = false
})
</script>
