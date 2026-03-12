<template>
  <div class="elo-table">
    <div v-for="(r, i) in rows" :key="r.model" class="stat-row elo-row">
      <span>
        <span class="elo-rank">#{{ i + 1 }}</span>
        <strong>{{ shortModel(r.model) }}</strong>
      </span>
      <span class="elo-stats">
        <strong>{{ r.rating }}</strong>
        <small :class="delta(r) >= 0 ? 'positive' : 'negative'">
          ({{ delta(r) >= 0 ? '+' : '' }}{{ delta(r) }})
        </small>
        <small class="elo-record">{{ r.wins }}W/{{ r.games - r.wins }}L - {{ r.winRate }}%</small>
      </span>
    </div>
  </div>
</template>

<script setup>
import { shortModel } from '../utils/format'

defineProps({
  rows: { type: Array, required: true },
})

function delta(r) {
  return r.rating - 1500
}
</script>
