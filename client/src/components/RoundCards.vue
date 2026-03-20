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
      <!-- Two Rooms: leader + hostage with colors -->
      <template v-if="gameType === 'two-rooms'">
        <div class="rc-lines">
          <div v-for="(line, i) in r.lines" :key="i" class="rc-line" v-html="line" />
        </div>
      </template>
      <!-- Secret Dictator -->
      <template v-else-if="gameType !== 'werewolf'">
        <div class="rc-info">{{ r.info }}</div>
        <div class="rc-result">
          <span v-if="r.outcome === 'liberal'" class="rc-liberal">L</span>
          <span v-else-if="r.outcome === 'fascist'" class="rc-fascist">F</span>
          <span v-else-if="r.outcome === 'rejected'" class="rc-rejected">X</span>
          <span v-else-if="r.outcome === 'chaos'" class="rc-chaos">!</span>
          <span v-else class="rc-pending">...</span>
        </div>
        <div v-if="r.detail" class="rc-killed">{{ r.detail }}</div>
      </template>
      <!-- Werewolf: rich lines with faction colors -->
      <template v-else>
        <div class="rc-lines">
          <div v-for="(line, i) in r.lines" :key="i" class="rc-line" v-html="line" />
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  events: { type: Array, required: true },
  currentRound: { type: Number, default: 0 },
  gameType: { type: String, default: 'secret-dictator' },
})

const ROLE_ICONS = {
  seer: '\uD83D\uDD2E',    // 🔮
  witch: '\uD83E\uDDD9\u200D\u2640\uFE0F', // 🧙‍♀️
}

// Build a player map from game_start event for faction colors + roles
const playerMap = computed(() => {
  const map = {}
  const start = props.events.find(e => e.type === 'game_start')
  if (start?.players) {
    for (const p of start.players) {
      map[p.name] = { party: p.party || p.team || 'unknown', role: p.role }
    }
  }
  return map
})

function colorName(name) {
  const info = playerMap.value[name] || { party: 'unknown' }
  const cssClass = info.party === 'werewolf' || info.party === 'fascist' || info.party === 'red' ? 'rc-name-evil' : 'rc-name-good'
  const icon = ROLE_ICONS[info.role] || ''
  return `<span class="${cssClass}">${name}</span>${icon ? ' ' + icon : ''}`
}

function scrollToRound(round) {
  const el = document.getElementById(`round-${round}`)
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const rounds = computed(() => {
  const map = new Map()

  for (const e of props.events) {
    const r = e.round
    if (!r) continue
    if (!map.has(r)) map.set(r, { round: r, info: '', outcome: '', detail: '', lines: [] })
    const entry = map.get(r)

    // Secret Dictator
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
    if (e.type === 'wolf_action') {
      entry.wolfTarget = e.target
    }
    if (e.type === 'witch_save') {
      const target = e.target || entry.wolfTarget
      entry.lines.push(`${ROLE_ICONS.witch} Saved ${target ? colorName(target) : 'the target'}`)
    }
    // witch_kill info comes from dawn.deaths with cause:witch, no separate line needed
    if (e.type === 'dawn') {
      if (e.deaths?.length) {
        entry.outcome = 'kill'
        for (const d of e.deaths) {
          const icon = d.cause === 'witch' ? ROLE_ICONS.witch : '\uD83D\uDC3A' // 🐺
          entry.lines.push(`${icon} Killed ${colorName(d.name)}`)
        }
      } else {
        entry.outcome = 'saved'
        if (!entry.lines.some(l => l.includes('Saved'))) {
          entry.lines.push('Everyone survived')
        }
      }
    }
    if (e.type === 'elimination') {
      entry.lines.push(`Voted out: ${colorName(e.player)}`)
    }
    if (e.type === 'no_elimination') {
      entry.lines.push('No elimination')
    }

    // Two Rooms
    if (e.type === 'leader_elected' && props.gameType === 'two-rooms') {
      const name = e.playerName || e.player
      if (!entry._leaders) entry._leaders = {}
      entry._leaders[e.room] = name
      // Rebuild leader line
      entry.lines = entry.lines.filter(l => !l.startsWith('Leader'))
      const parts = []
      if (entry._leaders.A) parts.push(colorName(entry._leaders.A))
      if (entry._leaders.B) parts.push(colorName(entry._leaders.B))
      entry.lines.unshift(`Leader: ${parts.join(' / ')}`)
    }
    if (e.type === 'exchange') {
      const aToB = (e.aToB||[]).map(n => colorName(n)).join(', ')
      const bToA = (e.bToA||[]).map(n => colorName(n)).join(', ')
      entry.lines.push(`Hostage: ${aToB} \u2194 ${bToA}`)
    }
  }

  return [...map.values()].sort((a, b) => a.round - b.round)
})
</script>

<style scoped>
.rc-lines {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 0.7rem;
}

.rc-line {
  line-height: 1.3;
  color: #aaa;
}

:deep(.rc-name-good) {
  color: #6bcaff;
  font-weight: 600;
}

:deep(.rc-name-evil) {
  color: #ff6b6b;
  font-weight: 600;
}
</style>
