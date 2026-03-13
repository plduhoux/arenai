<template>
  <div class="game-view">
    <div v-if="loading" class="loading">Loading game...</div>
    <div v-else-if="error" class="error">{{ error }}</div>

    <!-- LIVE MODE -->
    <template v-else-if="isLive">
      <div class="detail-header">
        <h2>Game in progress</h2>
        <StatusBar :state="sseState" />

        <PlayerChips
          :players="inspectorPlayers"
          :selectedIndex="selectedPlayer"
          @select="selectPlayer"
        />

        <SessionInspector
          v-if="selectedPlayer >= 0"
          :session="selectedSession"
          :playerName="selectedPlayerName"
          :playerRole="selectedPlayerRole"
          @close="selectedPlayer = -1"
        />

        <div class="game-controls">
          <button v-if="sseState.status === 'running'" class="btn-warning btn-large" @click="pause">Pause</button>
          <button v-if="sseState.status === 'paused'" class="btn-primary btn-large" @click="resume">Resume</button>
          <button v-if="sseState.status === 'running' || sseState.status === 'paused'" class="btn-danger btn-large" @click="stop">Stop Game</button>
        </div>
      </div>

      <RoundCards :events="liveEvents" :currentRound="sseState.round" :gameType="sseState.gameType" />

      <LiveFeed
        :events="liveEvents"
        :running="sseState.status === 'running' || sseState.status === 'paused'"
      />
    </template>

    <!-- FINISHED MODE (same LiveFeed, just from DB logs) -->
    <template v-else-if="game">
      <StatusBar :state="finishedState" />

      <PlayerChips
        :players="inspectorPlayers"
        :selectedIndex="selectedPlayer"
        @select="selectPlayer"
      />

      <SessionInspector
        v-if="selectedPlayer >= 0"
        :session="selectedSession"
        :playerName="selectedPlayerName"
        :playerRole="selectedPlayerRole"
        @close="selectedPlayer = -1"
      />

      <RoundCards :events="logs" :currentRound="0" :gameType="game.game_type" />

      <LiveFeed :events="logs" :running="false" />
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useGameSSE } from '../composables/useGameSSE'
import { fetchGame, fetchGameLogs } from '../composables/useApi'
import { formatTokens } from '../utils/format'
import StatusBar from '../components/StatusBar.vue'
import LiveFeed from '../components/LiveFeed.vue'
import RoundCards from '../components/RoundCards.vue'
import PlayerChips from '../components/PlayerChips.vue'
import SessionInspector from '../components/SessionInspector.vue'

const props = defineProps({
  id: { type: String, required: true },
})

const game = ref(null)
const logs = ref([])
const loading = ref(true)
const error = ref(null)
const isLive = ref(false)

const { events: liveEvents, state: sseState, connectToStream, disconnect, pause, resume, stop } = useGameSSE()

// Session inspector
const selectedPlayer = ref(-1)
const sessionsData = ref({ sessions: {}, players: [] })
let sessionPollInterval = null

function selectPlayer(index) {
  selectedPlayer.value = selectedPlayer.value === index ? -1 : index
  if (selectedPlayer.value >= 0) fetchSessions()
}

async function fetchSessions() {
  const gameId = sseState.value.gameId || props.id
  if (!gameId) return
  try {
    const res = await fetch(`/api/games/${gameId}/sessions`)
    if (res.ok) sessionsData.value = await res.json()
  } catch {}
}

const inspectorPlayers = computed(() => {
  // Live game: use SSE players + live sessions
  // Finished game: use DB players + session_stats
  const ssePlayers = sseState.value.players
  const gamePlayers = game.value?.players
  const raw = ssePlayers?.length ? ssePlayers
    : (gamePlayers || sessionsData.value.players || [])
  const players = Array.isArray(raw) ? raw : []

  const dbSessionStats = game.value?.session_stats || {}
  return players.map((p, i) => {
    const idx = p.index ?? i
    const key = `player:${idx}:${p.name}`
    const liveSession = sessionsData.value.sessions[key]
    const dbStats = dbSessionStats[key]
    return { ...p, index: idx, tokens: liveSession?.tokens || dbStats?.tokens || null }
  })
})

const selectedSession = computed(() => {
  if (selectedPlayer.value < 0) return null
  const player = inspectorPlayers.value.find(p => p.index === selectedPlayer.value)
  if (!player) return null
  const key = `player:${player.index}:${player.name}`
  // Live game: from SSE sessions. Finished game: from DB session_stats
  return sessionsData.value.sessions[key] || game.value?.session_stats?.[key] || null
})

const selectedPlayerName = computed(() => {
  const p = inspectorPlayers.value.find(p => p.index === selectedPlayer.value)
  return p?.name || ''
})

const selectedPlayerRole = computed(() => {
  const p = inspectorPlayers.value.find(p => p.index === selectedPlayer.value)
  return p?.role || ''
})

const finishedState = computed(() => {
  if (!game.value) return {}
  const g = game.value
  const players = g.players || []

  // Count alive/dead from final state
  const aliveWolves = players.filter(p => p.alive && (p.party === 'werewolf')).length
  const aliveVillagers = players.filter(p => p.alive && (p.party === 'villager')).length

  return {
    status: 'finished',
    gameType: g.game_type || 'secret-hitler',
    gameId: g.id,
    round: g.rounds || 0,
    winner: g.winner,
    players: g.players || [],
    // Secret Hitler
    liberalPolicies: g.policies_liberal || 0,
    fascistPolicies: g.policies_fascist || 0,
    electionTracker: 0,
    // Werewolf
    aliveWolves,
    aliveVillagers,
    aliveTotal: aliveWolves + aliveVillagers,
    // Tokens
    tokensInput: g.tokens_input || 0,
    tokensOutput: g.tokens_output || 0,
    tokensCacheRead: g.tokens_cache_read || 0,
    tokensCacheWrite: g.tokens_cache_write || 0,
    tokensTotalSent: g.tokens_total_sent || 0,
    apiCalls: g.api_calls || 0,
  }
})

async function loadFinishedGame() {
  try {
    const [g, l] = await Promise.all([
      fetchGame(props.id),
      fetchGameLogs(props.id),
    ])
    game.value = g
    logs.value = l
    isLive.value = false
  } catch {}
}

onMounted(async () => {
  try {
    const statusRes = await fetch('/api/status')
    const status = await statusRes.json()
    const isRunning = status.games?.some(g => g.id === props.id)

    if (isRunning) {
      isLive.value = true
      connectToStream(props.id)
      // Poll sessions every 2s for inspector
      sessionPollInterval = setInterval(fetchSessions, 2000)
      fetchSessions()
    } else {
      await loadFinishedGame()
    }
  } catch (e) {
    error.value = e.message
  }
  loading.value = false
})

onUnmounted(() => {
  disconnect()
  if (sessionPollInterval) clearInterval(sessionPollInterval)
})
</script>
