const STATIC = import.meta.env.VITE_STATIC === 'true'

export async function fetchApi(path, options = {}) {
  if (STATIC) {
    // In static mode, fetch from pre-generated JSON files
    const staticPath = apiPathToStatic(path)
    const res = await fetch(staticPath)
    if (!res.ok) throw new Error(`Static file not found: ${staticPath}`)
    return res.json()
  }

  const res = await fetch(`/api${path}`, options)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return res.json()
}

function apiPathToStatic(path) {
  // /games?limit=50 -> /data/games.json
  // /games/abc-123 -> /data/games/abc-123.json
  // /games/abc-123/logs -> /data/games/abc-123/logs.json
  // /stats -> /data/stats.json
  // /stats?gameType=werewolf -> /data/stats.json (filter client-side)
  // /elo -> /data/elo.json
  // /token-stats -> /data/token-stats.json
  // /status -> /data/status.json
  const [cleanPath] = path.split('?')
  return `/data${cleanPath}.json`
}

export async function startGame(config) {
  return fetchApi('/games/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  })
}

export async function fetchGames(limit = 100, offset = 0) {
  if (STATIC) return fetchApi('/games')
  return fetchApi(`/games?limit=${limit}&offset=${offset}`)
}

export async function fetchGame(id) {
  return fetchApi(`/games/${id}`)
}

export async function fetchGameLogs(id) {
  return fetchApi(`/games/${id}/logs`)
}

export async function fetchStats() {
  return fetchApi('/stats')
}

export async function fetchElo() {
  return fetchApi('/elo')
}

export async function fetchStatus() {
  return fetchApi('/status')
}

export const isStatic = STATIC
