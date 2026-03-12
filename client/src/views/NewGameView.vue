<template>
  <div class="new-game">
    <h1>New Game</h1>

    <div class="form-grid">
      <div class="form-group">
        <label>Game</label>
        <select v-model="gameType">
          <option value="secret-hitler">Secret Hitler</option>
          <option value="werewolf">Werewolf (Loup-Garou)</option>
          <option value="two-rooms">Two Rooms and a Boom</option>
        </select>
      </div>

      <div class="form-group">
        <label>Players: {{ playerCount }}</label>
        <input type="range" v-model.number="playerCount" :min="minPlayers" :max="maxPlayers" />
      </div>

      <div class="form-group" v-if="gameType === 'secret-hitler'">
        <label>Terminology</label>
        <select v-model="termsKey">
          <option value="neutral">Neutral (Dictator)</option>
          <option value="original">Original (Hitler)</option>
          <option value="fantasy">Fantasy (Shadow Lord)</option>
        </select>
      </div>

      <div class="form-group">
        <label>{{ factionLabels.good }} Model</label>
        <select v-model="modelLiberal">
          <option v-for="m in AVAILABLE_MODELS" :key="m.value" :value="m.value">{{ m.label }}</option>
        </select>
      </div>

      <div class="form-group">
        <label>{{ factionLabels.evil }} Model</label>
        <select v-model="modelFascist">
          <option v-for="m in AVAILABLE_MODELS" :key="m.value" :value="m.value">{{ m.label }}</option>
        </select>
      </div>

      <!-- Dictator uses the same model as Fascist (same team) -->

      <div class="form-group" v-if="gameType === 'secret-hitler'">
        <label>Game Length</label>
        <select v-model="gameLength">
          <option value="short">Short (3L / 4F)</option>
          <option value="medium">Medium (4L / 5F)</option>
          <option value="standard">Standard (5L / 6F)</option>
        </select>
      </div>

      <div class="form-group" v-if="gameType === 'werewolf'">
        <label>Discussion Rounds</label>
        <select v-model.number="discussionRounds">
          <option :value="1">1 round (fast)</option>
          <option :value="2">2 rounds</option>
          <option :value="3">3 rounds (benchmark)</option>
        </select>
      </div>

      <div class="form-group" v-if="gameType !== 'two-rooms'">
        <label>
          <input type="checkbox" v-model="enableThoughts" />
          Private thoughts (players reason internally before speaking - costs more tokens)
        </label>
      </div>
    </div>

    <button
      class="btn-primary btn-large"
      :disabled="starting"
      @click="launchGame"
    >
      {{ starting ? 'Starting...' : 'Start Game' }}
    </button>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { TERMS_PRESETS } from '../utils/models'

const router = useRouter()

const GAME_DEFAULTS = {
  'secret-hitler': { playerCount: 5, enableThoughts: false, discussionRounds: 1 },
  'werewolf': { playerCount: 6, enableThoughts: true, discussionRounds: 2 },
  'two-rooms': { playerCount: 10, enableThoughts: false, discussionRounds: 1 },
}

const gameType = ref('werewolf')
const playerCount = ref(6)
const termsKey = ref('neutral')
const AVAILABLE_MODELS = ref([])
const modelLiberal = ref('')
const modelFascist = ref('')

onMounted(async () => {
  const res = await fetch('/api/models/enabled')
  const models = await res.json()
  AVAILABLE_MODELS.value = models.map(m => ({
    value: m.model_id,
    label: `${m.display_name} (${m.provider_name})`,
  }))
  if (AVAILABLE_MODELS.value.length > 0) {
    modelLiberal.value = AVAILABLE_MODELS.value[0].value
    modelFascist.value = AVAILABLE_MODELS.value[0].value
  }
})
const gameLength = ref('standard')
const discussionRounds = ref(2)
const enableThoughts = ref(true)

// Reset defaults when game type changes
watch(gameType, (type) => {
  const defaults = GAME_DEFAULTS[type] || {}
  playerCount.value = defaults.playerCount ?? 6
  enableThoughts.value = defaults.enableThoughts ?? false
  discussionRounds.value = defaults.discussionRounds ?? 1
})

const minPlayers = computed(() => gameType.value === 'two-rooms' ? 6 : 5)
const maxPlayers = computed(() => 10)

const factionLabels = computed(() => {
  switch (gameType.value) {
    case 'werewolf': return { good: 'Villager', evil: 'Werewolf' }
    case 'two-rooms': return { good: 'Blue Team', evil: 'Red Team' }
    default: return { good: 'Liberal', evil: 'Fascist' }
  }
})
const starting = ref(false)

const WIN_POLICIES = {
  short: { liberal: 3, fascist: 4 },
  medium: { liberal: 4, fascist: 5 },
  standard: { liberal: 5, fascist: 6 },
}

async function launchGame() {
  starting.value = true
  const terms = TERMS_PRESETS[termsKey.value]

  try {
    const response = await fetch('/api/games/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gameType: gameType.value,
        playerCount: playerCount.value,
        modelLiberal: modelLiberal.value,
        modelFascist: modelFascist.value,
        enableThoughts: enableThoughts.value,
        ...(gameType.value === 'secret-hitler' ? {
          winPolicies: WIN_POLICIES[gameLength.value],
          terms,
        } : {}),
        ...(gameType.value === 'werewolf' ? {
          discussionRounds: discussionRounds.value,
        } : {}),
      }),
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      alert(err.error || 'Failed to start game')
      return
    }

    const { gameId } = await response.json()
    router.push(`/game/${gameId}`)
  } catch (err) {
    alert(err.message)
  } finally {
    starting.value = false
  }
}
</script>
