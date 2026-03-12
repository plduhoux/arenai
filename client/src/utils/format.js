export function formatTokens(n) {
  if (!n) return '0'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k'
  return String(n)
}

export function shortModel(m) {
  if (!m) return '?'
  return m
    .replace('claude-', '')
    .replace(/-\d+-\d+$/, '')
    .replace('sonnet', 'Sonnet')
    .replace('haiku', 'Haiku')
    .replace('opus', 'Opus')
}

export function formatDate(dateStr) {
  return new Date(dateStr).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function winReasonLabel(reason) {
  const labels = {
    five_liberal_policies: '5 liberal policies enacted',
    six_fascist_policies: '6 fascist policies enacted',
    hitler_elected: 'Dictator elected Chancellor',
    hitler_killed: 'Dictator was executed',
    max_rounds: 'Maximum rounds reached',
  }
  return labels[reason] || reason
}

export function getModelsSummary(game) {
  const players = game.players || []
  const models = [...new Set(players.map(p => p.model).filter(Boolean))]
  if (models.length <= 1) return shortModel(models[0] || game.model || '?')
  return models.map(shortModel).join(' vs ')
}
