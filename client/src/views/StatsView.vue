<template>
  <div class="stats-view">
    <div class="stats-header">
      <h1>Stats</h1>
      <div class="header-filters">
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
        <div class="model-filter-wrap" @click.stop>
          <button class="filter-pill model-filter-btn" :class="{ active: excludedModels.size > 0 }" @click="modelFilterOpen = !modelFilterOpen">
            Models{{ excludedModels.size > 0 ? ` (${allModels.length - excludedModels.size}/${allModels.length})` : '' }}
          </button>
          <div v-if="modelFilterOpen" class="model-filter-popover">
            <label v-for="m in allModels" :key="m" class="model-filter-item" @click.prevent="toggleModel(m)">
              <input type="checkbox" :checked="isModelVisible(m)" tabindex="-1" />
              <span>{{ shortModel(m) }}</span>
            </label>
          </div>
        </div>
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

        <div v-if="h2hModels.length >= 2" class="stat-card wide-card">
          <h3>Head to Head</h3>
          <div class="h2h-filters">
            <button
              v-for="f in h2hDisplayModes" :key="f.id"
              class="filter-pill" :class="{ active: h2hMode === f.id }"
              @click="h2hMode = f.id"
            >{{ f.label }}</button>
          </div>
          <div class="table-scroll">
          <table class="h2h-table">
            <thead>
              <tr>
                <th class="h2h-corner"><span class="h2h-corner-row">Row</span><span class="h2h-corner-sep">\</span><span class="h2h-corner-col">Col</span></th>
                <th v-for="m in h2hModels" :key="m" class="h2h-col-header">{{ shortModel(m) }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in h2hModels" :key="row">
                <td class="model-name">{{ shortModel(row) }}</td>
                <td v-for="col in h2hModels" :key="col" class="h2h-cell" :class="{ diagonal: row === col }">
                  <template v-if="row === col">
                    <span class="diagonal-dash">-</span>
                  </template>
                  <template v-else-if="getH2HDetail(row, col)">
                    <div class="h2h-content" :class="h2hOverallClass(row, col)">
                      <template v-if="h2hMode === 'wl'">
                        <span class="h2h-main">{{ getH2HDetail(row, col).totalWins }}-{{ getH2HDetail(row, col).total - getH2HDetail(row, col).totalWins }}</span>
                      </template>
                      <template v-else-if="h2hMode === 'pct'">
                        <span class="h2h-main">{{ h2hWinPct(row, col) }}%</span>
                      </template>
                      <template v-else-if="h2hMode === 'role'">
                        <span class="h2h-role-detail">
                          <span class="h2h-role-total">{{ getH2HDetail(row, col).totalWins }}</span>
                          <span class="h2h-role-breakdown">(<span class="h2h-good">{{ getH2HDetail(row, col).asGoodWins }}</span><span class="h2h-sep">/</span><span class="h2h-evil">{{ getH2HDetail(row, col).asEvilWins }}</span>)</span>
                        </span>
                      </template>
                      <template v-else-if="h2hMode === 'games'">
                        <span class="h2h-main">{{ getH2HDetail(row, col).total }}</span>
                      </template>
                    </div>
                  </template>
                  <template v-else>
                    <span class="h2h-empty">-</span>
                  </template>
                </td>
              </tr>
            </tbody>
          </table>
          </div>
        </div>

        <div v-if="filteredByModel.length" class="stat-card wide-card">
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
              <tr v-for="m in filteredByModel" :key="m.model">
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
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
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

// ═══════ PERSISTENT FILTERS (localStorage) ═══════
const STORAGE_KEY = 'arenai-stats-filters'

function loadFilters() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}
  } catch { return {} }
}

function saveFilters(patch) {
  const current = loadFilters()
  Object.assign(current, patch)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(current))
}

const saved = loadFilters()

const activeSection = ref(props.section)
const gameTypeFilter = ref(saved.gameType || 'all')
const allGameTypes = ref([])

// H2H display mode
const h2hMode = ref(saved.h2hMode || 'wl')
const h2hDisplayModes = [
  { id: 'wl', label: 'W-L' },
  { id: 'pct', label: 'Win %' },
  { id: 'role', label: 'By Role' },
  { id: 'games', label: 'Games' },
]

// Model filter
const excludedModels = ref(new Set(saved.excludedModels || []))
const modelFilterOpen = ref(false)

watch(h2hMode, (v) => saveFilters({ h2hMode: v }))
watch(gameTypeFilter, (v) => saveFilters({ gameType: v }))
watch(excludedModels, (v) => {
  saveFilters({ excludedModels: [...v] })
  // Reload all loaded data with new filter
  loadStats()
  if (elo.value) loadElo()
  if (tokenData.value) loadTokens()
}, { deep: true })

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

// All known models (stable list for filter popover - never shrinks)
const knownModels = ref([])

const allModels = computed(() => knownModels.value)

function updateKnownModels(models) {
  const set = new Set(knownModels.value)
  for (const m of models) set.add(m)
  knownModels.value = [...set].sort()
}

function toggleModel(model) {
  const s = new Set(excludedModels.value)
  if (s.has(model)) s.delete(model)
  else s.add(model)
  excludedModels.value = s
}

function isModelVisible(model) {
  return !excludedModels.value.has(model)
}

// Head-to-head matrix (filtered)
const h2hModels = computed(() => {
  return allModels.value.filter(m => !excludedModels.value.has(m))
})

// Filtered byModel rows
const filteredByModel = computed(() => {
  if (!stats.value?.byModel) return []
  return stats.value.byModel.filter(m => !excludedModels.value.has(m.model))
})

function getH2H(rowModel, colModel) {
  if (!stats.value?.headToHead) return null
  const [a, b] = [rowModel, colModel].sort()
  const match = stats.value.headToHead.find(h => h.modelA === a && h.modelB === b)
  if (!match) return null
  // From row model's perspective
  const isA = rowModel === a
  return {
    // Row model as good side vs col model as evil
    asGoodWins: isA ? match.aGoodWins : match.aEvilLosses ? 0 : match.aEvilLosses, // need to flip
    asGoodTotal: isA ? (match.aGoodWins + match.aGoodLosses) : (match.aEvilWins + match.aEvilLosses),
    // Row model as evil side vs col model as good
    asEvilWins: isA ? match.aEvilWins : match.aGoodLosses ? 0 : match.aGoodLosses,
    asEvilTotal: isA ? (match.aEvilWins + match.aEvilLosses) : (match.aGoodWins + match.aGoodLosses),
    total: match.total,
    totalWins: isA ? (match.aGoodWins + match.aEvilWins) : (match.aGoodLosses + match.aEvilLosses),
  }
}

// Recompute properly: when row is A, row's wins as good = aGoodWins; when row is B, row's wins as good = aEvilLosses (B was good when A was evil, B won when A lost as evil)
function getH2HDetail(rowModel, colModel) {
  if (!stats.value?.headToHead) return null
  const [a, b] = [rowModel, colModel].sort()
  const match = stats.value.headToHead.find(h => h.modelA === a && h.modelB === b)
  if (!match) return null
  const isA = rowModel === a
  if (isA) {
    return {
      asGoodWins: match.aGoodWins,
      asGoodGames: match.aGoodWins + match.aGoodLosses,
      asEvilWins: match.aEvilWins,
      asEvilGames: match.aEvilWins + match.aEvilLosses,
      total: match.total,
      totalWins: match.aGoodWins + match.aEvilWins,
    }
  } else {
    // Row is B: B as good = when A was evil
    return {
      asGoodWins: match.aEvilLosses,
      asGoodGames: match.aEvilWins + match.aEvilLosses,
      asEvilWins: match.aGoodLosses,
      asEvilGames: match.aGoodWins + match.aGoodLosses,
      total: match.total,
      totalWins: match.aEvilLosses + match.aGoodLosses,
    }
  }
}

function h2hWinPct(rowModel, colModel) {
  const d = getH2HDetail(rowModel, colModel)
  if (!d || !d.total) return 0
  return Math.round((d.totalWins / d.total) * 100)
}

function h2hOverallClass(rowModel, colModel) {
  const d = getH2HDetail(rowModel, colModel)
  if (!d) return ''
  if (d.totalWins > d.total - d.totalWins) return 'winning'
  if (d.totalWins < d.total - d.totalWins) return 'losing'
  return 'tied'
}

function buildExcludeParam() {
  if (excludedModels.value.size === 0) return ''
  return `excludeModels=${[...excludedModels.value].map(encodeURIComponent).join(',')}`
}

function buildUrl(base, extraParams = {}) {
  const parts = []
  for (const [k, v] of Object.entries(extraParams)) {
    if (v) parts.push(`${k}=${encodeURIComponent(v)}`)
  }
  const ex = buildExcludeParam()
  if (ex) parts.push(ex)
  return parts.length ? `${base}?${parts.join('&')}` : base
}

async function loadStats() {
  statsLoading.value = true
  const gt = gameTypeFilter.value
  const base = isStatic ? '/data/stats.json' : '/api/stats'
  const url = isStatic ? base : buildUrl(base, gt !== 'all' ? { gameType: gt } : {})
  const res = await fetch(url)
  let data = await res.json()
  // In static mode, filter client-side
  if (isStatic && gt && gt !== 'all' && data.byGameType) {
    data = data.byGameType[gt] || data
  }
  stats.value = data
  if (data.byModel) updateKnownModels(data.byModel.map(m => m.model))
  // Always update game types if we get a bigger or initial list; only "all" returns the full list
  if (data.gameTypes && (gt === 'all' || allGameTypes.value.length === 0)) {
    if (gt === 'all' || data.gameTypes.length > allGameTypes.value.length) {
      allGameTypes.value = data.gameTypes
    }
  }
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
    const url = isStatic ? '/data/elo.json' : buildUrl('/api/elo')
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
    const url = isStatic ? '/data/token-stats.json' : buildUrl('/api/token-stats')
    const res = await fetch(url)
    tokenData.value = await res.json()
  } catch {}
  tokensLoading.value = false
}

// Close model filter on outside click
function onDocClick() { modelFilterOpen.value = false }

// ═══════ INIT ═══════
onMounted(() => {
  document.addEventListener('click', onDocClick, true)
  loadStats()
  // Always fetch unfiltered stats once to populate full model list + game types
  if (gameTypeFilter.value !== 'all' || excludedModels.value.size > 0) {
    fetch(isStatic ? '/data/stats.json' : '/api/stats')
      .then(r => r.json())
      .then(d => {
        if (d.gameTypes) allGameTypes.value = d.gameTypes
        if (d.byModel) updateKnownModels(d.byModel.map(m => m.model))
      })
      .catch(() => {})
  }
  if (activeSection.value === 'elo') loadElo()
  else if (activeSection.value === 'tokens') loadTokens()
})

onUnmounted(() => {
  document.removeEventListener('click', onDocClick, true)
})
</script>

<style scoped>
/* Head-to-head matrix */
.h2h-filters {
  display: flex;
  gap: 0.3rem;
  margin-bottom: 0.75rem;
}
.model-filter-wrap {
  position: relative;
}
.model-filter-btn {
  font-size: 0.78rem;
}
.model-filter-popover {
  position: absolute;
  top: 100%;
  right: 0;
  z-index: 50;
  margin-top: 0.3rem;
  background: var(--bg, #1a1a2e);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0.5rem;
  min-width: 180px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.3);
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}
.model-filter-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.35rem 0.5rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.82rem;
  color: var(--text);
  user-select: none;
}
.model-filter-item:hover {
  background: var(--bg2);
}
.model-filter-item input[type="checkbox"] {
  accent-color: var(--accent);
  pointer-events: none;
}
.h2h-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8rem;
}
.h2h-table th, .h2h-table td {
  padding: 0.5rem;
  text-align: center;
  border: 1px solid var(--border);
}
.h2h-corner {
  font-size: 0.65rem;
  color: var(--text2);
  white-space: nowrap;
}
.h2h-corner-row { opacity: 0.7; }
.h2h-corner-sep { margin: 0 0.15rem; opacity: 0.3; }
.h2h-corner-col { opacity: 0.7; }
.h2h-col-header {
  font-size: 0.75rem;
  font-weight: 600;
  max-width: 100px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.h2h-cell {
  min-width: 70px;
  vertical-align: middle;
}
.h2h-cell.diagonal {
  background: var(--bg2);
}
.diagonal-dash, .h2h-empty {
  color: var(--text2);
  opacity: 0.3;
}
.h2h-content {
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1.3;
}
.h2h-content.winning { color: var(--good, #22c55e); }
.h2h-content.losing { color: var(--evil, #ef4444); }
.h2h-content.tied { color: var(--text2); }
.h2h-main {
  font-weight: 700;
  font-size: 0.9rem;
}
.h2h-role-detail {
  display: flex;
  align-items: baseline;
  gap: 0.3rem;
  font-size: 0.8rem;
}
.h2h-role-total {
  font-weight: 700;
  font-size: 0.9rem;
}
.h2h-role-breakdown {
  font-size: 0.72rem;
  font-weight: 600;
  opacity: 0.85;
}
.h2h-good { color: var(--good, #22c55e); }
.h2h-evil { color: var(--evil, #ef4444); }
.h2h-sep { color: var(--text2); opacity: 0.4; }

.stats-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
  flex-wrap: wrap;
  gap: 0.75rem;
}
.stats-header h1 { margin: 0; }

.header-filters {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

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
