<template>
  <div class="live-event" :class="eventClass">
    <component :is="'div'" v-html="content" />
  </div>
</template>

<script setup>
import { computed } from 'vue'

const ROLE_ICONS = {
  seer: '\uD83D\uDD2E',    // crystal ball
  witch: '\u2697\uFE0F',    // alembic
  president: '\uD83C\uDFDB\uFE0F',  // classical building
  bomber: '\uD83D\uDCA3',   // bomb
}

const props = defineProps({
  event: { type: Object, required: true },
  playerRoles: { type: Object, default: () => ({}) },
})

function esc(s) {
  if (!s) return ''
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Colorize a player name based on their role
function pname(name) {
  if (!name) return ''
  const info = props.playerRoles[name]
  if (!info) return `<strong>${esc(name)}</strong>`
  const party = info.party || info.team
  const cls = (party === 'werewolf' || party === 'fascist' || party === 'red') ? 'player-evil' : 'player-good'
  const icon = ROLE_ICONS[info.role] || ''
  return `<strong class="${cls}">${esc(name)}</strong>${icon ? '<span class="role-icon">' + icon + '</span>' : ''}`
}

const eventClass = computed(() => {
  const e = props.event
  if (e.type === 'round_start' || e.type === 'game_end') return 'live-round'
  return ''
})

const content = computed(() => {
  const e = props.event
  switch (e.type) {
    case 'narrator':
      return `<span class="narrator-text">${esc(e.message)}</span>`

    case 'game_start': {
      const count = e.players?.length || '?'
      if (e.gameType === 'werewolf') {
        const roleList = (e.players || []).map(p => {
          const icon = ROLE_ICONS[p.role] || ''
          const cls = p.party === 'werewolf' ? 'player-evil' : 'player-good'
          return `<strong class="${cls}">${esc(p.name)}</strong>${icon ? '<span class="role-icon">' + icon + '</span>' : ''}: <span class="${p.party === 'werewolf' ? 'live-fascist' : 'live-liberal'}">${esc(p.role || p.party)}</span>`
        }).join(', ')
        return `<span class="narrator-text">New Werewolf game with ${count} players. Roles: ${roleList}</span>`
      }
      if (e.gameType === 'two-rooms') {
        const names = (e.players || []).map(p => pname(p.name)).join(', ')
        return `<span class="narrator-text">Two Rooms and a Boom with ${count} players: ${names}. Blue Team protects the President. Red Team sends the Bomber. 3 rounds of deception and hostage exchanges.</span>`
      }
      const names = (e.players || []).map(p => pname(p.name)).join(', ')
      return `<span class="narrator-text">New game of Secret Hitler with ${count} players: ${names}. Roles have been secretly assigned. The fascists know each other and who the Dictator is. The Dictator and Liberals are in the dark. Let the deception begin.</span>`
    }

    case 'game_paused':
      return `<span class="narrator-text">Game paused.</span>`

    case 'game_resumed':
      return `<span class="narrator-text">Game resumed.</span>`

    case 'round_start':
      return `<strong>Round ${e.round}</strong> - President: ${pname(e.president)}`

    case 'nomination':
      return `<span class="live-label">Nominate</span> ${pname(e.president)} picks ${pname(e.chancellor)}`

    case 'thought':
      return `<span class="live-label live-thought">Thought</span> ${pname(e.player)}: <span class="thought-text">${esc(e.thought)}</span>`

    case 'discussion': {
      const stanceTag = e.stance ? ` <span class="stance-tag stance-${e.stance}">${e.stance}</span>` : ''
      const roomTag = e.room ? ` <span class="room-tag room-${e.room.toLowerCase()}">[${e.room}]</span>` : ''
      return `<span class="live-label">Discuss</span>${roomTag} ${pname(e.player)}${stanceTag}: ${esc(e.message)}`
    }

    case 'vote': {
      if (e.vote) {
        const cls = e.vote === 'ja' ? 'live-liberal' : 'live-fascist'
        return `<span class="live-label">Vote</span> ${pname(e.player)}: <span class="${cls}">${e.vote?.toUpperCase()}</span>`
      }
      return `<span class="live-label">Vote</span> ${pname(e.player)}: ${pname(e.target) || 'SKIP'}`
    }

    case 'election_result': {
      const cls = e.passed ? 'live-liberal' : 'live-fascist'
      return `<span class="live-label">Election</span> <span class="${cls}">${e.passed ? 'PASSED' : 'FAILED'}</span> (${e.ja} Ja / ${e.nein} Nein)`
    }

    case 'president_action':
      return `<span class="live-label">President</span> claims: ${esc(e.claim?.slice(0, 120))}`

    case 'chancellor_action':
      return `<span class="live-label">Chancellor</span> claims: ${esc(e.claim?.slice(0, 120))}`

    case 'policy_enacted': {
      const cls = e.policy === 'liberal' ? 'live-liberal' : 'live-fascist'
      return `<span class="live-label">Policy</span> <span class="${cls}">${e.policy?.toUpperCase()}</span> enacted (L:${e.liberal}/5 F:${e.fascist}/6)`
    }

    case 'power':
      return `<span class="live-label">Power</span> ${esc(e.power)}: ${pname(e.president)} targets ${pname(e.target) || 'n/a'}`

    case 'veto_proposed':
      return `<span class="live-label live-fascist">Veto</span> ${pname(e.chancellor)} proposes a veto`

    case 'veto_accepted':
      return `<span class="live-label">Veto</span> ${pname(e.president)} accepts the veto. Both cards discarded.`

    case 'veto_rejected':
      return `<span class="live-label live-fascist">Veto</span> ${pname(e.president)} rejects the veto. Chancellor must play.`

    case 'vote_swing': {
      const swings = e.swings || 0
      const details = (e.preVotes || []).map((pv, i) => {
        const post = e.postVotes?.[i]
        const changed = pv.intention !== post?.intention
        return changed ? `${esc(pv.player)}: ${pv.intention} -> ${post.intention}` : null
      }).filter(Boolean).join(', ')
      return `<span class="live-label">Swing</span> ${swings} vote(s) changed${details ? ': ' + details : ''}`
    }

    // Two Rooms events
    case 'room_header':
      return `<div class="room-header room-header-${e.room?.toLowerCase()}">Room ${esc(e.room)} <span class="room-players">${esc(e.players)}</span></div>`

    case 'share':
      return `<span class="live-label">Share</span> ${pname(e.player)} shows ${e.shareType} to ${pname(e.target)} [Room ${esc(e.room)}]`

    case 'leader_vote':
      return `<span class="live-label">Nominate</span> ${pname(e.voter)} votes for ${pname(e.pick)} [Room ${esc(e.room)}]`

    case 'leader_elected':
      return `<span class="live-label live-liberal">Leader</span> ${pname(e.player)} elected in Room ${esc(e.room)}`

    case 'hostage_selected':
      return `<span class="live-label">Hostage</span> Room A sends: ${(e.roomA||[]).map(n => pname(n)).join(', ')} | Room B sends: ${(e.roomB||[]).map(n => pname(n)).join(', ')}`

    case 'exchange':
      return `<span class="live-label live-fascist">Exchange</span> ${(e.aToB||[]).map(n => pname(n)).join(', ')} moved to B | ${(e.bToA||[]).map(n => pname(n)).join(', ')} moved to A`

    case 'gambler_prediction':
      return `<span class="live-label">Gambler</span> ${pname(e.player)} predicts: <span class="${e.prediction === 'blue' ? 'live-liberal' : 'live-fascist'}">${e.prediction?.toUpperCase()}</span>`

    // Werewolf: Mayor election
    case 'mayor_candidacy':
      return `<span class="live-label">${e.runs ? 'Runs' : 'Declines'}</span> ${pname(e.player)}: ${esc(e.reason)}`

    case 'mayor_vote':
      return `<span class="live-label">Mayor Vote</span> ${pname(e.voter)} votes for ${pname(e.pick)}`

    case 'mayor_elected':
      return `<span class="live-label live-liberal">Mayor</span> ${pname(e.player)} elected Mayor`

    case 'mayor_successor':
      return `<span class="live-label">Successor</span> ${pname(e.to)} named new Mayor by ${pname(e.from)}`

    // Werewolf: Wolf chat
    case 'wolf_chat':
      return `<span class="live-label live-fascist">Wolf Chat</span> ${pname(e.player)}: ${esc(e.message)}`

    // Werewolf events
    case 'night_start':
      return `<strong>Night ${e.round}</strong>`

    case 'wolf_action':
      return `<span class="live-label live-fascist">Wolves</span> target ${pname(e.target)}`

    case 'seer_action':
      return `<span class="live-label live-liberal">Seer</span> inspects ${pname(e.target)}: ${e.result === 'werewolf' ? '<span class="live-fascist">WEREWOLF</span>' : '<span class="live-liberal">VILLAGER</span>'}`

    case 'witch_save':
      return `<span class="live-label">Witch</span> uses save potion`

    case 'witch_kill':
      return `<span class="live-label live-fascist">Witch</span> poisons ${pname(e.target)}`

    case 'dawn': {
      if (!e.deaths?.length) return `<span class="live-label live-liberal">Dawn</span> Everyone survived (Witch saved)`
      const deathDescs = e.deaths.map(d => pname(d.name)).join(' and ')
      return `<span class="live-label live-fascist">Dawn</span> ${deathDescs} killed`
    }

    case 'elimination':
      return `<span class="live-label live-fascist">Eliminated</span> ${pname(e.player)} (${esc(e.role)}) with ${e.votes} votes`

    case 'runoff':
      return `<span class="live-label live-fascist">Runoff</span> Tie between ${(e.tied||[]).map(n => pname(n)).join(' and ')}`

    case 'no_elimination':
      return `<span class="live-label">Vote</span> Still tied. Nobody eliminated.`

    case 'error':
      return `<div class="live-error">LLM Error: ${esc(e.message)}</div>`

    case 'game_end': {
      const isGood = e.winner === 'liberal' || e.winner === 'villager'
      const cls = isGood ? 'live-liberal' : 'live-fascist'
      return `<strong>GAME OVER</strong> - <span class="${cls}">${e.winner?.toUpperCase()}</span> wins! (${esc(e.reason)})`
    }

    default:
      return `<span class="live-label">${esc(e.type)}</span> ${esc(JSON.stringify(e).slice(0, 100))}`
  }
})
</script>
