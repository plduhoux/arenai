<template>
  <div class="round-cards">
    <div
      v-for="r in rounds"
      :key="r.round"
      class="round-card"
      :class="[r.outcome, { active: r.round === currentRound }]"
      @click="scrollToRound(r.round)"
      style="cursor: pointer"
    >
      <div class="rc-round">R{{ r.round }}</div>
      <div class="rc-info">{{ r.info }}</div>
      <div class="rc-result">
        <span v-if="r.outcome === 'liberal'" class="rc-liberal">L</span>
        <span v-else-if="r.outcome === 'fascist'" class="rc-fascist">F</span>
        <span v-else-if="r.outcome === 'rejected'" class="rc-rejected">X</span>
        <span v-else-if="r.outcome === 'chaos'" class="rc-chaos">!</span>
        <span v-else-if="r.outcome === 'kill'" class="rc-fascist">K</span>
        <span v-else-if="r.outcome === 'saved'" class="rc-liberal">S</span>
        <span v-else-if="r.outcome === 'no-kill'" class="rc-rejected">-</span>
        <span v-else class="rc-pending">...</span>
      </div>
      <div v-if="r.detail" class="rc-killed">{{ r.detail }}</div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  events: { type: Array, required: true },
  currentRound: { type: Number, default: 0 },
  gameType: { type: String, default: 'secret-hitler' },
})

function scrollToRound(round) {
  const el = document.getElementById(`round-${round}`)
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const rounds = computed(() => {
  const map = new Map()

  for (const e of props.events) {
    const r = e.round
    if (!r) continue
    if (!map.has(r)) map.set(r, { round: r, info: '', outcome: '', detail: '' })
    const entry = map.get(r)

    // Secret Hitler
    if (e.type === 'round_start') entry.info = `${e.president || ''} / ${e.chancellor || '?'}`
    if (e.type === 'nomination' && !entry.info) entry.info = e.chancellor || ''
    if (e.type === 'election_result' && !e.passed) entry.outcome = 'rejected'
    if (e.type === 'policy_enacted') {
      entry.outcome = e.chaos ? 'chaos' : (e.policy === 'liberal' ? 'liberal' : 'fascist')
    }
    if (e.type === 'power') {
      const short = { investigate: 'Inv', special_election: 'Elec', peek: 'Peek', kill: 'Kill' }
      entry.detail = short[e.power] || e.power
      if (e.power === 'kill' && e.target) entry.detail += ` ${e.target}`
    }

    // Werewolf
    if (e.type === 'dawn') {
      if (e.deaths?.length) {
        entry.outcome = 'kill'
        entry.info = e.deaths.map(d => `${d.name} (${d.role || '?'})`).join(', ')
      } else {
        entry.outcome = 'saved'
        entry.info = 'Witch saved'
      }
    }
    if (e.type === 'elimination') {
      entry.detail = `Voted: ${e.player} (${e.role || '?'})`
    }
    if (e.type === 'no_elimination') {
      entry.detail = 'No elim'
    }

    // Two Rooms
    if (e.type === 'exchange') {
      entry.info = `${(e.aToB||[]).join(',')} / ${(e.bToA||[]).join(',')}`
      entry.outcome = 'liberal' // just for color
    }
  }

  return [...map.values()].sort((a, b) => a.round - b.round)
})
</script>
