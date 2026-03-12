<template>
  <div class="status-bar" :class="`status-${state.status}`">
    <div class="status-items">
      <div class="status-item">
        <span class="status-label">Status</span>
        <span class="status-value" :class="`status-${state.status}`">{{ statusText }}</span>
      </div>
      <div class="status-item">
        <span class="status-label">Round</span>
        <span class="status-value">{{ state.round }}</span>
      </div>
      <!-- Secret Hitler stats -->
      <template v-if="state.gameType === 'secret-hitler' || (!state.gameType && state.liberalPolicies !== undefined)">
        <div class="status-item">
          <span class="status-label">Liberal</span>
          <span class="status-value liberal">{{ state.liberalPolicies }}/{{ state.liberalTarget || 5 }}</span>
        </div>
        <div class="status-item">
          <span class="status-label">Fascist</span>
          <span class="status-value fascist">{{ state.fascistPolicies }}/{{ state.fascistTarget || 6 }}</span>
        </div>
        <div class="status-item">
          <span class="status-label">Elections</span>
          <span class="status-value">{{ state.electionTracker }}/3</span>
        </div>
      </template>
      <!-- Werewolf stats -->
      <template v-else-if="state.gameType === 'werewolf'">
        <div class="status-item">
          <span class="status-label">Alive</span>
          <span class="status-value">{{ state.aliveTotal || '?' }}</span>
        </div>
        <div class="status-item">
          <span class="status-label">Wolves</span>
          <span class="status-value fascist">{{ state.aliveWolves }}</span>
        </div>
        <div class="status-item">
          <span class="status-label">Villagers</span>
          <span class="status-value liberal">{{ state.aliveVillagers }}</span>
        </div>
      </template>
      <!-- Two Rooms stats -->
      <template v-else-if="state.gameType === 'two-rooms'">
        <div class="status-item">
          <span class="status-label">Room A</span>
          <span class="status-value liberal">{{ state.roomACount || '?' }}</span>
        </div>
        <div class="status-item">
          <span class="status-label">Room B</span>
          <span class="status-value fascist">{{ state.roomBCount || '?' }}</span>
        </div>
      </template>
      <div class="status-item">
        <span class="status-label">Tokens</span>
        <span class="status-value">{{ formatTokens(state.tokensInput) }} / {{ formatTokens(state.tokensOutput) }}</span>
      </div>
      <div class="status-item">
        <span class="status-label">API Calls</span>
        <span class="status-value">{{ state.apiCalls }}</span>
      </div>
    </div>
    <div v-if="matchup" class="status-matchup-row">
      <span class="matchup-faction matchup-good">{{ matchup.goodLabel }}</span>
      <span class="matchup-model-tag">{{ matchup.goodModel }}</span>
      <span class="matchup-vs">vs</span>
      <span class="matchup-faction matchup-evil">{{ matchup.evilLabel }}</span>
      <span class="matchup-model-tag">{{ matchup.evilModel }}</span>
    </div>
    <div v-if="state.status === 'finished'" class="status-result">
      <span :class="isGoodWinner ? 'liberal' : 'fascist'">
        {{ winnerLabel }}
      </span>
    </div>
    <div v-if="state.status === 'error'" class="status-error">
      {{ state.errorMessage }}
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { formatTokens, shortModel } from '../utils/format'

const props = defineProps({
  state: { type: Object, required: true },
})

const statusText = computed(() => {
  const labels = {
    idle: 'Ready',
    connecting: 'Starting...',
    running: 'In progress',
    paused: 'Paused',
    finished: 'Finished',
    error: 'Error',
  }
  return labels[props.state.status] || props.state.status
})

const WINNER_LABELS = {
  liberal: 'LIBERAL WIN', fascist: 'FASCIST WIN',
  villager: 'VILLAGER WIN', werewolf: 'WEREWOLF WIN',
  blue: 'BLUE TEAM WIN', red: 'RED TEAM WIN',
  draw: 'DRAW',
}

const isGoodWinner = computed(() =>
  ['liberal', 'villager', 'blue'].includes(props.state.winner)
)

const winnerLabel = computed(() =>
  WINNER_LABELS[props.state.winner] || props.state.winner?.toUpperCase() || ''
)

const FACTION_LABELS = {
  'secret-hitler': { good: 'Liberal', evil: 'Fascist' },
  'werewolf': { good: 'Villager', evil: 'Werewolf' },
  'two-rooms': { good: 'Blue', evil: 'Red' },
}

const matchup = computed(() => {
  const s = props.state
  if (!s.players?.length && !s.goodModel) return null
  const type = s.gameType || 'secret-hitler'
  const labels = FACTION_LABELS[type] || FACTION_LABELS['secret-hitler']

  let goodModel = s.goodModel
  let evilModel = s.evilModel

  if (!goodModel && s.players?.length) {
    const goodParties = ['liberal', 'villager', 'blue']
    const evilParties = ['fascist', 'werewolf', 'red']
    for (const p of s.players) {
      if (goodParties.includes(p.party || p.team) && !goodModel) goodModel = p.model
      if (evilParties.includes(p.party || p.team) && !evilModel) evilModel = p.model
    }
  }

  if (!goodModel && !evilModel) return null

  return {
    goodLabel: labels.good,
    evilLabel: labels.evil,
    goodModel: shortModel(goodModel || '?'),
    evilModel: shortModel(evilModel || '?'),
  }
})
</script>
