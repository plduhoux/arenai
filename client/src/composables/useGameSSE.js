import { ref, onUnmounted } from 'vue'

export function useGameSSE() {
  const events = ref([])
  const state = ref({
    status: 'idle', // idle | connecting | running | paused | finished | error
    round: 0,
    liberalPolicies: 0,
    fascistPolicies: 0,
    electionTracker: 0,
    liberalTarget: 5,
    fascistTarget: 6,
    tokensInput: 0,
    tokensOutput: 0,
    tokensCacheRead: 0,
    tokensCacheWrite: 0,
    tokensTotalSent: 0,
    apiCalls: 0,
    winner: null,
    winReason: null,
    gameId: null,
    gameType: null,
    players: [],
    aliveWolves: 0,
    aliveVillagers: 0,
    aliveTotal: 0,
    roomACount: 0,
    roomBCount: 0,
  })

  let eventSource = null
  let aborted = false

  function updateStateFromEvent(event) {
    if (event.round) state.value.round = event.round
    if (event.liberal !== undefined) state.value.liberalPolicies = event.liberal
    if (event.fascist !== undefined) state.value.fascistPolicies = event.fascist
    if (event.liberalPolicies !== undefined) state.value.liberalPolicies = event.liberalPolicies
    if (event.fascistPolicies !== undefined) state.value.fascistPolicies = event.fascistPolicies
    if (event.liberalTarget !== undefined) state.value.liberalTarget = event.liberalTarget
    if (event.fascistTarget !== undefined) state.value.fascistTarget = event.fascistTarget
    if (event.electionTracker !== undefined) state.value.electionTracker = event.electionTracker
    if (event.aliveWolves !== undefined) state.value.aliveWolves = event.aliveWolves
    if (event.aliveVillagers !== undefined) state.value.aliveVillagers = event.aliveVillagers
    if (event.aliveTotal !== undefined) state.value.aliveTotal = event.aliveTotal
    if (event.roomACount !== undefined) state.value.roomACount = event.roomACount
    if (event.roomBCount !== undefined) state.value.roomBCount = event.roomBCount
    if (event.tokensInput !== undefined) state.value.tokensInput = event.tokensInput
    if (event.tokensOutput !== undefined) state.value.tokensOutput = event.tokensOutput
    if (event.tokensCacheRead !== undefined) state.value.tokensCacheRead = event.tokensCacheRead
    if (event.tokensCacheWrite !== undefined) state.value.tokensCacheWrite = event.tokensCacheWrite
    if (event.tokensTotalSent !== undefined) state.value.tokensTotalSent = event.tokensTotalSent
    else if (event.tokensInput !== undefined) state.value.tokensTotalSent = (event.tokensInput || 0) + (event.tokensCacheRead || 0) + (event.tokensCacheWrite || 0)
    if (event.apiCalls !== undefined) state.value.apiCalls = event.apiCalls
    if (event.players) state.value.players = event.players
  }

  // Start a new game: POST to create, then connect to stream
  async function startGame(config) {
    events.value = []
    state.value.status = 'connecting'
    aborted = false

    try {
      const response = await fetch('/api/games/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.error || `HTTP ${response.status}`)
      }

      const { gameId } = await response.json()
      state.value.gameId = gameId

      // Connect to SSE stream
      connectToStream(gameId)

      return gameId
    } catch (err) {
      state.value.status = 'error'
      state.value.errorMessage = err.message
      return null
    }
  }

  // Connect to an existing game's SSE stream
  function connectToStream(gameId) {
    disconnect()
    state.value.gameId = gameId
    state.value.status = 'running'
    aborted = false

    eventSource = new EventSource(`/api/games/${gameId}/stream`)

    eventSource.addEventListener('game', (e) => {
      if (aborted) return
      try {
        const data = JSON.parse(e.data)

        if (data.type === 'game_start') {
          state.value.status = 'running'
          if (data.gameType) state.value.gameType = data.gameType
        }
        if (data.type === 'game_paused') state.value.status = 'paused'
        if (data.type === 'game_resumed') state.value.status = 'running'

        updateStateFromEvent(data)
        events.value.push(data)
      } catch {}
    })

    eventSource.addEventListener('done', (e) => {
      try {
        const data = JSON.parse(e.data)
        state.value.status = 'finished'
        state.value.gameId = data.id
        state.value.winner = data.winner
        state.value.winReason = data.winReason
        state.value.round = data.rounds
        if (data.tokensInput) state.value.tokensInput = data.tokensInput
        if (data.tokensOutput) state.value.tokensOutput = data.tokensOutput
        if (data.tokensCacheRead) state.value.tokensCacheRead = data.tokensCacheRead
        if (data.tokensCacheWrite) state.value.tokensCacheWrite = data.tokensCacheWrite
        if (data.tokensTotalSent) state.value.tokensTotalSent = data.tokensTotalSent
        if (data.apiCalls) state.value.apiCalls = data.apiCalls
      } catch {}
      disconnect()
    })

    eventSource.addEventListener('error', (e) => {
      // EventSource reconnects automatically, but if the game is over, stop
      if (state.value.status === 'finished') {
        disconnect()
      }
    })
  }

  async function pause() {
    const id = state.value.gameId
    if (!id) return
    await fetch(`/api/games/${id}/pause`, { method: 'POST' })
    state.value.status = 'paused'
  }

  async function resume() {
    const id = state.value.gameId
    if (!id) return
    await fetch(`/api/games/${id}/resume`, { method: 'POST' })
    state.value.status = 'running'
  }

  async function stop() {
    const id = state.value.gameId
    if (!id) return
    await fetch(`/api/games/${id}/stop`, { method: 'POST' })
  }

  function disconnect() {
    aborted = true
    if (eventSource) {
      eventSource.close()
      eventSource = null
    }
  }

  onUnmounted(disconnect)

  return { events, state, startGame, connectToStream, disconnect, pause, resume, stop }
}
