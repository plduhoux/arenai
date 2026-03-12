<template>
  <div class="live-feed" ref="feedRef">
    <LiveEvent
      v-for="(event, i) in events"
      :key="i"
      :event="event"
      :playerRoles="playerRoles"
      :id="roundAnchorId(event, i)"
    />
    <div v-if="!events.length && running" class="live-waiting">
      Waiting for first event...
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import LiveEvent from './LiveEvent.vue'

const props = defineProps({
  events: { type: Array, required: true },
  running: { type: Boolean, default: false },
})

const feedRef = ref(null)

// Map: first event index for each round
const firstEventByRound = computed(() => {
  const map = {}
  for (let i = 0; i < props.events.length; i++) {
    const r = props.events[i].round
    if (r && !(r in map)) map[r] = i
  }
  return map
})

function roundAnchorId(event, index) {
  const r = event.round
  if (!r) return undefined
  return firstEventByRound.value[r] === index ? `round-${r}` : undefined
}

// Extract player roles from game_start event
const playerRoles = computed(() => {
  const startEvent = props.events.find(e => e.type === 'game_start')
  if (!startEvent?.players) return {}
  const map = {}
  for (const p of startEvent.players) {
    map[p.name] = { role: p.role, party: p.party, team: p.team }
  }
  return map
})

// Auto-scroll on new events
watch(
  () => props.events.length,
  async () => {
    await nextTick()
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
  },
)
</script>
