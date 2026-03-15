<template>
  <div class="new-game">
    <h1>New Game</h1>

    <div class="game-selector">
      <div
        v-for="g in games"
        :key="g.id"
        class="game-card-wrap"
      >
        <button
          class="game-card"
          :class="{ selected: gameType === g.id }"
          @click="gameType = g.id"
        >
          <span class="game-card-icon">{{ g.icon }}</span>
          <span class="game-card-name">{{ g.name }}</span>
          <span class="game-card-desc">{{ g.desc }}</span>
        </button>
        <button class="info-btn" @click.stop="toggleInfo(g.id)" :class="{ active: openInfo === g.id }">i</button>
        <div v-if="openInfo === g.id" class="info-popover" @click.stop>
          <button class="info-close" @click.stop="openInfo = null">&times;</button>
          <h4>{{ g.name }}</h4>
          <p class="info-rules">{{ g.rules }}</p>
          <div class="info-tokens">
            <span class="info-token-label">Est. usage:</span>
            <span class="info-token-val">{{ g.tokenEstimate }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="options-stack">
      <div class="form-group">
        <label>Players: {{ playerCount }}</label>
        <input type="range" v-model.number="playerCount" :min="minPlayers" :max="maxPlayers" />
      </div>

      <div class="form-group">
        <label>{{ factionLabels.good }} Model</label>
        <select v-model="modelGood">
          <option v-for="m in availableModels" :key="m.value" :value="m.value">{{ m.label }}</option>
        </select>
      </div>

      <div class="form-group">
        <label>{{ factionLabels.evil }} Model</label>
        <select v-model="modelEvil">
          <option v-for="m in availableModels" :key="m.value" :value="m.value">{{ m.label }}</option>
        </select>
      </div>

      <div class="form-group" v-if="gameType === 'secret-dictator'">
        <label>Terminology</label>
        <select v-model="termsKey">
          <option value="neutral">Neutral (Dictator)</option>
          <option value="original">Original (Dictator)</option>
          <option value="fantasy">Fantasy (Shadow Lord)</option>
        </select>
      </div>

      <div class="form-group" v-if="gameType === 'secret-dictator'">
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

      <div class="form-group">
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

    <div class="battle-section">
      <h2>Battle Mode</h2>
      <p class="battle-desc">Launch multiple games with alternating roles between two models.</p>

      <div class="battle-config">
        <div class="form-group">
          <label>Number of games</label>
          <div class="battle-count">
            <button v-for="n in [2, 4, 10, 20]" :key="n"
              class="count-btn" :class="{ active: battleCount === n }"
              @click="battleCount = n"
            >{{ n }}</button>
            <input type="number" v-model.number="battleCount" min="2" max="50" step="2" class="count-input" />
          </div>
        </div>
      </div>

      <button
        class="btn-primary btn-large btn-battle"
        :disabled="battling || modelGood === modelEvil"
        @click="launchBattle"
      >
        {{ battling ? `Launching... (${battleProgress}/${battleCount})` : `Battle ${battleCount} games` }}
      </button>
      <p v-if="modelGood === modelEvil" class="battle-warn">Pick two different models for Battle mode.</p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { TERMS_PRESETS } from '../utils/constants'
import { shortModel } from '../utils/format'

const router = useRouter()

const GAME_DEFAULTS = {
  'secret-dictator': { playerCount: 5, enableThoughts: false, discussionRounds: 1 },
  'werewolf': { playerCount: 7, enableThoughts: true, discussionRounds: 2 },
  'two-rooms': { playerCount: 8, enableThoughts: true, discussionRounds: 1 },
}

const games = [
  {
    id: 'werewolf', name: 'Werewolf', icon: '\u{1F43A}',
    desc: 'Classic social deduction. Villagers vs wolves. Seer, Witch, Mayor.',
    rules: 'Villagers vs Werewolves. Night: wolves pick a victim, Seer inspects a player, Witch can save/kill. Day: discussion, then vote to eliminate. Mayor election on day 1 (breaks ties). Wolves win when they equal or outnumber villagers. Villagers win by eliminating all wolves.',
    tokenEstimate: '~50-60k tokens per game',
  },
  {
    id: 'two-rooms', name: 'Two Rooms', icon: '\u{1F4A3}',
    desc: 'Two teams, two rooms, hostage exchanges. Find the President.',
    rules: 'Blue vs Red team in 2 rooms over 3 rounds. Blue has a President, Red has a Bomber. Each round: discuss, elect a room leader, leader picks hostages to swap rooms. Players can share cards (verified) or make verbal claims (unverifiable). Red wins if the Bomber ends in the same room as the President.',
    tokenEstimate: '~100k tokens per game',
  },
  {
    id: 'secret-dictator', name: 'Secret Dictator', icon: '\u{1F3DB}',
    desc: 'Hidden roles, policy cards, legislative deception. 5-10 players.',
    rules: 'Liberals vs Fascists. Each round: a President nominates a Chancellor, all vote. If approved, President draws 3 policy cards, discards 1, Chancellor picks from 2. Liberals win with 5 liberal policies or by executing the Dictator. Fascists win with 6 fascist policies or electing the Dictator as Chancellor after 3+ fascist policies.',
    tokenEstimate: '~200k tokens per game',
  },
]

const gameType = ref('werewolf')
const playerCount = ref(GAME_DEFAULTS['werewolf'].playerCount)
const termsKey = ref('neutral')
const availableModels = ref([])
const modelGood = ref('')
const modelEvil = ref('')
const openInfo = ref(null)

onMounted(async () => {
  const res = await fetch('/api/models/enabled')
  const models = await res.json()
  availableModels.value = models.map(m => ({
    value: m.model_id,
    label: `${m.display_name} (${m.provider_name})`,
  }))
  if (availableModels.value.length > 0) {
    modelGood.value = availableModels.value[0].value
    modelEvil.value = availableModels.value[0].value
  }
})

const gameLength = ref('standard')
const discussionRounds = ref(GAME_DEFAULTS['werewolf'].discussionRounds)
const enableThoughts = ref(GAME_DEFAULTS['werewolf'].enableThoughts)

watch(gameType, (type) => {
  const defaults = GAME_DEFAULTS[type] || {}
  playerCount.value = defaults.playerCount ?? 6
  enableThoughts.value = defaults.enableThoughts ?? false
  discussionRounds.value = defaults.discussionRounds ?? 1
})

const minPlayers = computed(() => gameType.value === 'two-rooms' ? 6 : 5)
const maxPlayers = computed(() => 20)

const factionLabels = computed(() => {
  switch (gameType.value) {
    case 'werewolf': return { good: 'Villager', evil: 'Werewolf' }
    case 'two-rooms': return { good: 'Blue Team', evil: 'Red Team' }
    default: return { good: 'Liberal', evil: 'Fascist' }
  }
})
const starting = ref(false)
const battling = ref(false)
const battleCount = ref(2)
const battleProgress = ref(0)

const WIN_POLICIES = {
  short: { liberal: 3, fascist: 4 },
  medium: { liberal: 4, fascist: 5 },
  standard: { liberal: 5, fascist: 6 },
}

function toggleInfo(id) {
  openInfo.value = openInfo.value === id ? null : id
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
        modelGood: modelGood.value,
        modelEvil: modelEvil.value,
        enableThoughts: enableThoughts.value,
        ...(gameType.value === 'secret-dictator' ? {
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

async function launchBattle() {
  battling.value = true
  battleProgress.value = 0

  try {
    const response = await fetch('/api/games/battle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gameType: gameType.value,
        playerCount: playerCount.value,
        modelA: modelGood.value,
        modelB: modelEvil.value,
        count: battleCount.value,
        enableThoughts: enableThoughts.value,
        ...(gameType.value === 'secret-dictator' ? {
          winPolicies: WIN_POLICIES[gameLength.value],
          terms: TERMS_PRESETS[termsKey.value],
        } : {}),
        ...(gameType.value === 'werewolf' ? {
          discussionRounds: discussionRounds.value,
        } : {}),
      }),
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      alert(err.error || 'Failed to start battle')
      return
    }

    const { gameIds } = await response.json()
    battleProgress.value = gameIds.length
    router.push('/')
  } catch (err) {
    alert(err.message)
  } finally {
    battling.value = false
  }
}
</script>

<style scoped>
.game-card-wrap {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
}

.info-btn {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: var(--bg3);
  color: var(--text2);
  font-size: 0.75rem;
  font-weight: 700;
  font-style: italic;
  font-family: Georgia, serif;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
  z-index: 2;
}
.info-btn:hover, .info-btn.active {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--bg2);
}

.info-popover {
  position: absolute;
  top: calc(100% + 0.5rem);
  left: 0;
  right: 0;
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 1rem;
  z-index: 20;
  box-shadow: 0 8px 24px rgba(0,0,0,0.4);
  min-width: 280px;
}

.info-popover h4 {
  font-size: 0.95rem;
  margin-bottom: 0.5rem;
}

.info-close {
  position: absolute;
  top: 0.4rem;
  right: 0.6rem;
  background: none;
  border: none;
  color: var(--text2);
  font-size: 1.2rem;
  cursor: pointer;
}
.info-close:hover { color: var(--text); }

.info-rules {
  font-size: 0.8rem;
  color: var(--text2);
  line-height: 1.5;
  margin-bottom: 0.75rem;
}

.info-tokens {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.8rem;
  padding: 0.4rem 0.6rem;
  background: var(--bg3);
  border-radius: 4px;
}

.info-token-label {
  color: var(--text2);
}

.info-token-val {
  font-family: var(--mono);
  color: var(--accent);
  font-weight: 600;
}

@media (max-width: 640px) {
  .info-popover {
    position: fixed;
    top: auto;
    bottom: 0;
    left: 0;
    right: 0;
    border-radius: 12px 12px 0 0;
    max-height: 60vh;
    overflow-y: auto;
  }
}
</style>
