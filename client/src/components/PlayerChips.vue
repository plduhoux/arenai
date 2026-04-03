<template>
  <div class="player-chips">
    <button
      v-for="p in players"
      :key="p.index"
      class="player-chip"
      :class="[
        p.party || p.team || 'unknown',
        { dead: !p.alive, active: selectedIndex === p.index }
      ]"
      @click="$emit('select', p.index)"
    >
      <span class="chip-name">{{ p.name }}</span>
      <span class="chip-role">{{ p.role }}</span>
      <span v-if="p.word" class="chip-word">"{{ p.word }}"</span>
      <span v-if="p.tokens" class="chip-tokens">
        {{ formatK(p.tokens.input + p.tokens.cacheRead + p.tokens.cacheWrite) }}
        <span v-if="p.tokens.cacheRead > 0" class="chip-cached">{{ Math.round(p.tokens.cacheRead / (p.tokens.input + p.tokens.cacheRead + p.tokens.cacheWrite) * 100) }}%</span>
      </span>
    </button>
  </div>
</template>

<script setup>
defineProps({
  players: { type: Array, default: () => [] },
  selectedIndex: { type: Number, default: -1 },
})
defineEmits(['select'])

function formatK(n) {
  if (!n) return ''
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
  return String(n)
}
</script>

<style scoped>
.player-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px 12px;
  background: #1a1a2e;
  border-bottom: 1px solid #2a2a4a;
}

.player-chip {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid #3a3a5a;
  background: #252545;
  cursor: pointer;
  transition: all 0.15s;
  font-size: 0.75rem;
  min-width: 60px;
}

.player-chip:hover {
  border-color: #6a6a9a;
  background: #2f2f55;
}

.player-chip.active {
  border-color: #7c7cff;
  background: #35356a;
  box-shadow: 0 0 8px rgba(124, 124, 255, 0.3);
}

.chip-name {
  font-weight: 600;
  color: #e0e0e0;
}

.chip-role {
  font-size: 0.65rem;
  color: #888;
  text-transform: uppercase;
}

.chip-tokens {
  font-size: 0.6rem;
  color: #aaa;
  font-family: monospace;
}

.chip-cached {
  color: #4ade80;
  margin-left: 2px;
}

/* Faction colors */
.player-chip.werewolf .chip-name,
.player-chip.fascist .chip-name,
.player-chip.red .chip-name,
.player-chip.undercover .chip-name { color: #ff6b6b; }
.player-chip.villager .chip-name,
.player-chip.liberal .chip-name,
.player-chip.blue .chip-name,
.player-chip.civilian .chip-name { color: #6bcaff; }

.chip-word {
  font-size: 0.6rem;
  font-style: italic;
  font-weight: 600;
}
.player-chip.undercover .chip-word { color: #ff6b6b; }
.player-chip.civilian .chip-word { color: #6bcaff; }

.player-chip.dead {
  opacity: 0.4;
}
</style>
