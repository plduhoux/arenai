<template>
  <div class="stats-view">
    <div class="stats-header">
      <h1>Stats</h1>
      <div class="game-filter" v-if="allGameTypes.length > 0">
        <button
          class="filter-pill" :class="{ active: gameTypeFilter === 'all' }"
          @click="gameTypeFilter = 'all'"
        >All</button>
        <button
          v-for="gt in allGameTypes" :key="gt"
          class="filter-pill" :class="{ active: gameTypeFilter === gt }"
          @click="gameTypeFilter = gt"
        >{{ gameTypeLabel(gt) }}</button>
      </div>
    </div>

    <!-- Main section tabs -->
    <div class="section-tabs">
      <button
        v-for="s in sections" :key="s.id"
        class="section-tab" :class="{ active: activeSection === s.id }"
        @click="switchSection(s.id)"
      >{{ s.label }}</button>
    </div>

    <!-- ═══════ STATISTICS ═══════ -->
    <template v-if="activeSection === 'statistics'">
      <div v-if="statsLoading" class="loading">Loading stats...</div>
      <div v-else-if="!stats?.totals?.total" class="empty-state">
        <p>No finished games yet. Start playing!</p>
      </div>
      <div v-else class="stats-grid">
        <div class="stat-card">
          <h3>Total Games</h3>
          <div class="big-number">{{ stats.totals.total }}</div>
        </div>

        <div class="stat-card">
          <h3>Win Rate</h3>
          <div class="win-rate-row">
            <span class="good">{{ statsLabels.good }} {{ goodPct }}%</span>
            <span class="evil">{{ statsLabels.evil }} {{ evilPct }}%</span>
          </div>
          <div class="win-bar">
            <div class="good-fill" :style="{ width: goodPct + '%' }" />
          </div>
          <div class="win-counts">
            {{ stats.totals.good_wins }} {{ statsLabels.good.toLowerCase() }} / {{ stats.totals.evil_wins }} {{ statsLabels.evil.toLowerCase() }}
          </div>
        </div>

        <div class="stat-card">
          <h3>Averages</h3>
          <div class="stat-row">
            <span>Rounds per game</span>
            <span>{{ (stats.totals.avg_rounds || 0).toFixed(1) }}</span>
          </div>
        </div>

        <div v-if="stats.byReason?.length" class="stat-card">
          <h3>Win Reasons</h3>
          <div v-for="r in stats.byReason" :key="r.win_reason" class="stat-row">
            <span>{{ winReasonLabel(r.win_reason) }}</span>
            <span>{{ r.count }}</span>
          </div>
        </div>

        <div v-if="stats.byModel?.length" class="stat-card wide-card">
          <h3>By Model</h3>
          <div class="table-scroll">
          <table class="model-table">
            <thead>
              <tr>
                <th>Model</th>
                <th>Played</th>
                <th>Won</th>
                <th>Lost</th>
                <th>Win %</th>
                <th>As {{ statsLabels.good }}</th>
                <th>{{ statsLabels.good }} Wins</th>
                <th>As {{ statsLabels.evil }}</th>
                <th>{{ statsLabels.evil }} Wins</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="m in stats.byModel" :key="m.model">
                <td class="model-name">{{ shortModel(m.model) }}</td>
                <td>{{ m.played }}</td>
                <td class="wins">{{ m.wins }}</td>
                <td class="losses">{{ m.played - m.wins }}</td>
                <td>
                  <div class="win-rate-cell">
                    <div class="win-bar-inline">
                      <div class="win-fill" :style="{ width: winPct(m) + '%' }"></div>
                    </div>
                    <span class="win-pct-label">{{ winPct(m) }}%</span>
                  </div>
                </td>
                <td>{{ m.asGood }}</td>
                <td class="good">{{ m.goodWins }}</td>
                <td>{{ m.asEvil }}</td>
                <td class="evil">{{ m.evilWins }}</td>
              </tr>
            </tbody>
          </table>
          </div>
        </div>
      </div>
    </template>

    <!-- ═══════ ELO ═══════ -->
    <template v-if="activeSection === 'elo'">
      <div v-if="eloLoading" class="loading">Loading ELO data...</div>
      <div v-else-if="!eloCurrentData?.overall?.length" class="empty-state">
        <p>No ELO data yet. Play some games!</p>
      </div>
      <template v-else>
        <div class="stats-grid">
          <div class="stat-card wide-card">
            <h3>Overall</h3>
            <EloTable :rows="eloCurrentData.overall" />
          </div>
          <div v-if="eloCurrentData.good?.length" class="stat-card">
            <h3>Good Side</h3>
            <EloTable :rows="eloCurrentData.good" />
          </div>
          <div v-if="eloCurrentData.evil?.length" class="stat-card">
            <h3>Evil Side</h3>
            <EloTable :rows="eloCurrentData.evil" />
          </div>
        </div>
      </template>
    </template>

    <!-- ═══════ TOKENS ═══════ -->
    <template v-if="activeSection === 'tokens'">
      <div v-if="tokensLoading" class="loading">Loading token data...</div>
      <div v-else-if="!tokensCurrentData?.models?.length" class="empty-state">
        <p>No token data yet. Play some games!</p>
      </div>
      <template v-else>
        <div class="totals-bar">
          <div class="total-item total-cost">
            <span class="total-label">Est. cost</span>
            <span class="total-value">${{ fmtCost(tokensCurrentData.totals.cost) }}</span>
          </div>
          <div class="total-item">
            <span class="total-label">Total tokens</span>
            <span class="total-value">{{ fmt(tokensCurrentData.totals.total) }}</span>
          </div>
          <div class="total-item">
            <span class="total-label">Input</span>
            <span class="total-value">{{ fmt(tokensCurrentData.totals.input) }}</span>
          </div>
          <div class="total-item">
            <span class="total-label">Output</span>
            <span class="total-value">{{ fmt(tokensCurrentData.totals.output) }}</span>
          </div>
          <div class="total-item">
            <span class="total-label">Cache read</span>
            <span class="total-value">{{ fmt(tokensCurrentData.totals.cacheRead) }}</span>
          </div>
        </div>

        <div class="stat-card wide-card">
          <h3>By Model</h3>
          <div class="table-scroll">
          <table class="token-table">
            <thead>
              <tr>
                <th>Model</th>
                <th class="right">Games</th>
                <th class="right">Input</th>
                <th class="right">Output</th>
                <th class="right">Cache</th>
                <th class="right">Total</th>
                <th class="right">Cost</th>
                <th class="right">Avg/game</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="m in tokensCurrentData.models" :key="m.model">
                <td class="model-name">{{ shortModel(m.model) }}</td>
                <td class="right">{{ m.games }}</td>
                <td class="right">{{ fmt(m.input) }}</td>
                <td class="right">{{ fmt(m.output) }}</td>
                <td class="right">{{ fmt(m.cacheRead) }}</td>
                <td class="right total-col">{{ fmt(m.total) }}</td>
                <td class="right cost-col">${{ fmtCost(m.cost) }}</td>
                <td class="right avg-col">{{ fmt(m.avgTotal) }} <span class="avg-cost">${{ fmtCost(m.avgCost) }}</span></td>
              </tr>
            </tbody>
          </table>
          </div>
        </div>

        <div class="stat-card wide-card">
          <h3>Per Game</h3>
          <div class="table-scroll">
          <table class="token-table game-table">
            <thead>
              <tr>
                <th>Game</th>
                <th>Type</th>
                <th class="right">Input</th>
                <th class="right">Output</th>
                <th class="right">Total</th>
                <th class="right">Cost</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="g in tokensCurrentGames" :key="g.id" @click="$router.push(`/game/${g.id}`)" class="clickable">
                <td>
                  <span class="game-models">
                    {{ Object.keys(g.models).map(shortModel).join(' vs ') || '?' }}
                  </span>
                  <span class="game-date">{{ formatDate(g.created_at) }}</span>
                </td>
                <td class="type-cell">{{ gameTypeLabel(g.game_type) }}</td>
                <td class="right">{{ fmt(gameInput(g)) }}</td>
                <td class="right">{{ fmt(gameOutput(g)) }}</td>
                <td class="right total-col">{{ fmt(gameInput(g) + gameOutput(g)) }}</td>
                <td class="right cost-col">${{ fmtCost(gameCost(g)) }}</td>
              </tr>
            </tbody>
          </table>
          </div>
        </div>
      </template>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { shortModel, winReasonLabel, formatTokens as fmt, formatDate } from '../utils/format'
import { isStatic } from '../composables/useApi'
import EloTable from '../components/EloTable.vue'

const router = useRouter()
const route = useRoute()

const props = defineProps({
  section: { type: String, default: 'statistics' },
})

const sections = [
  { id: 'statistics', label: 'Statistics' },
  { id: 'elo', label: 'ELO' },
  { id: 'tokens', label: 'Tokens' },
]

const activeSection = ref(props.section)
const gameTypeFilter = ref('all')
const allGameTypes = ref([])

watch(() => props.section, (v) => { activeSection.value = v })

// When game type filter changes, reload data for current section
watch(gameTypeFilter, () => {
  if (activeSection.value === 'statistics') loadStats()
  // ELO and tokens are computed from already-loaded data, so just reactivity handles it
})

function switchSection(id) {
  activeSection.value = id
  router.replace({ query: { section: id } })
  if (id === 'elo' && !elo.value) loadElo()
  if (id === 'tokens' && !tokenData.value) loadTokens()
}

const GAME_TYPE_LABELS = {
  'secret-dictator': 'Secret Dictator',
  'werewolf': 'Werewolf',
  'two-rooms': 'Two Rooms',
}
function gameTypeLabel(type) {
  return GAME_TYPE_LABELS[type] || type
}

const GAME_LABELS = {
  'secret-dictator': { good: 'Liberal', evil: 'Fascist' },
  'werewolf': { good: 'Villager', evil: 'Werewolf' },
  'two-rooms': { good: 'Blue', evil: 'Red' },
}

// ═══════ STATISTICS ═══════
const stats = ref(null)
const statsLoading = ref(true)

const statsLabels = computed(() => {
  if (gameTypeFilter.value === 'all') return { good: 'Good', evil: 'Evil' }
  return GAME_LABELS[gameTypeFilter.value] || { good: 'Good', evil: 'Evil' }
})

const goodPct = computed(() => {
  const t = stats.value?.totals
  const decided = (t?.good_wins || 0) + (t?.evil_wins || 0)
  return decided > 0 ? Math.round((t.good_wins / decided) * 100) : 0
})
const evilPct = computed(() => 100 - goodPct.value)

function winPct(m) {
  return m.played > 0 ? Math.round((m.wins / m.played) * 100) : 0
}

async function loadStats() {
  statsLoading.value = true
  const gt = gameTypeFilter.value
  const base = isStatic ? '/data/stats.json' : '/api/stats'
  const params = (!isStatic && gt && gt !== 'all') ? `?gameType=${gt}` : ''
  const res = await fetch(`${base}${params}`)
  let data = await res.json()
  // In static mode, filter client-side
  if (isStatic && gt && gt !== 'all' && data.byGameType) {
    data = data.byGameType[gt] || data
  }
  stats.value = data
  if (data.gameTypes) allGameTypes.value = data.gameTypes
  statsLoading.value = false
}

// ═══════ ELO ═══════
const elo = ref(null)
const eloLoading = ref(true)

const eloCurrentData = computed(() => {
  if (!elo.value) return null
  const gt = gameTypeFilter.value
  if (gt === 'all') {
    return { overall: elo.value.overall, good: elo.value.byRole?.good, evil: elo.value.byRole?.evil }
  }
  return elo.value.byGame?.[gt] || null
})

async function loadElo() {
  eloLoading.value = true
  try {
    const url = isStatic ? '/data/elo.json' : '/api/elo'
    const res = await fetch(url)
    elo.value = await res.json()
  } catch {}
  eloLoading.value = false
}

// ═══════ TOKENS ═══════
const tokenData = ref(null)
const tokensLoading = ref(true)

function fmtCost(n) {
  if (!n) return '0.00'
  if (n >= 1) return n.toFixed(2)
  if (n >= 0.01) return n.toFixed(3)
  return n.toFixed(4)
}

function gameInput(g) {
  return Object.values(g.models).reduce((s, m) => s + (m.input || 0), 0)
}
function gameOutput(g) {
  return Object.values(g.models).reduce((s, m) => s + (m.output || 0), 0)
}
function gameCost(g) {
  return Object.values(g.models).reduce((s, m) => s + (m.cost || 0), 0)
}

const tokensCurrentData = computed(() => {
  if (!tokenData.value) return null
  const gt = gameTypeFilter.value
  if (gt === 'all') return tokenData.value
  return tokenData.value.byGame?.[gt] || null
})

const tokensCurrentGames = computed(() => {
  if (!tokensCurrentData.value?.games) return []
  const gt = gameTypeFilter.value
  if (gt === 'all') return tokensCurrentData.value.games
  return tokensCurrentData.value.games.filter(g => g.game_type === gt)
})

async function loadTokens() {
  tokensLoading.value = true
  try {
    const url = isStatic ? '/data/token-stats.json' : '/api/token-stats'
    const res = await fetch(url)
    tokenData.value = await res.json()
  } catch {}
  tokensLoading.value = false
}

// ═══════ INIT ═══════
onMounted(() => {
  loadStats()
  if (activeSection.value === 'elo') loadElo()
  else if (activeSection.value === 'tokens') loadTokens()
})
</script>

<style scoped>
.stats-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
  flex-wrap: wrap;
  gap: 0.75rem;
}
.stats-header h1 { margin: 0; }

.game-filter {
  display: flex;
  gap: 0.3rem;
}
.filter-pill {
  padding: 0.3rem 0.7rem;
  border: 1px solid var(--border);
  border-radius: 20px;
  background: var(--bg2);
  color: var(--text2);
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.15s;
}
.filter-pill:hover { border-color: var(--accent); color: var(--text); }
.filter-pill.active {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}

.section-tabs {
  display: flex;
  gap: 0;
  margin-bottom: 1.5rem;
  border-bottom: 2px solid var(--border);
}
.section-tab {
  padding: 0.6rem 1.2rem;
  background: transparent;
  border: none;
  color: var(--text2);
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  transition: all 0.15s;
}
.section-tab:hover { color: var(--text); }
.section-tab.active {
  color: var(--accent);
  border-bottom-color: var(--accent);
}
</style>
