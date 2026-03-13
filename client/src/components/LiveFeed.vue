<template>
  <div class="live-feed" ref="feedRef">
    <!-- Two Rooms: split by room -->
    <template v-if="isTwoRooms">
      <template v-for="(group, gi) in roomGroups" :key="gi">
        <!-- Full-width events (global) -->
        <template v-if="group.type === 'global'">
          <LiveEvent
            v-for="(event, i) in group.events"
            :key="`g-${gi}-${i}`"
            :event="event"
            :playerRoles="playerRoles"
          />
        </template>
        <!-- Room columns -->
        <div v-else class="room-columns">
          <div class="room-col room-col-a">
            <LiveEvent
              v-for="(event, i) in group.roomA"
              :key="`a-${gi}-${i}`"
              :event="event"
              :playerRoles="playerRoles"
            />
          </div>
          <div class="room-col room-col-b">
            <LiveEvent
              v-for="(event, i) in group.roomB"
              :key="`b-${gi}-${i}`"
              :event="event"
              :playerRoles="playerRoles"
            />
          </div>
        </div>
      </template>
    </template>

    <!-- Other games: single feed -->
    <template v-else>
      <LiveEvent
        v-for="(event, i) in events"
        :key="i"
        :event="event"
        :playerRoles="playerRoles"
        :id="roundAnchorId(event, i)"
      />
    </template>

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
  gameType: { type: String, default: '' },
})

const feedRef = ref(null)
const isTwoRooms = computed(() => props.gameType === 'two-rooms')

// Events that belong to a specific room
const ROOM_EVENTS = new Set(['room_header', 'discussion', 'thought', 'share', 'leader_vote', 'leader_elected'])

function eventRoom(e) {
  if (!ROOM_EVENTS.has(e.type)) return null
  return e.room || null
}

// Group events into alternating global / room-split sections
const roomGroups = computed(() => {
  const groups = []
  let currentGlobal = []
  let currentRoomA = []
  let currentRoomB = []
  let inRoomSection = false

  function flushRooms() {
    if (currentRoomA.length || currentRoomB.length) {
      groups.push({ type: 'rooms', roomA: currentRoomA, roomB: currentRoomB })
      currentRoomA = []
      currentRoomB = []
    }
    inRoomSection = false
  }

  function flushGlobal() {
    if (currentGlobal.length) {
      groups.push({ type: 'global', events: currentGlobal })
      currentGlobal = []
    }
  }

  for (const e of props.events) {
    const room = eventRoom(e)
    if (room) {
      if (!inRoomSection) {
        flushGlobal()
        inRoomSection = true
      }
      if (room === 'A') currentRoomA.push(e)
      else currentRoomB.push(e)
    } else {
      if (inRoomSection) flushRooms()
      currentGlobal.push(e)
    }
  }
  // Flush remaining
  if (inRoomSection) flushRooms()
  flushGlobal()

  return groups
})

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

// Auto-scroll only when user is near the bottom
function isNearBottom() {
  const threshold = 150
  return (window.innerHeight + window.scrollY) >= (document.body.scrollHeight - threshold)
}

watch(
  () => props.events.length,
  async () => {
    if (!isNearBottom()) return
    await nextTick()
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
  },
)
</script>

<style scoped>
.room-columns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1px;
  background: var(--border);
  border-radius: 4px;
  overflow: hidden;
  margin: 4px 0;
}

.room-col {
  background: var(--bg);
  padding: 4px;
  min-height: 40px;
}

.room-col-a {
  border-left: 3px solid var(--liberal);
}

.room-col-b {
  border-left: 3px solid var(--warning);
}

@media (max-width: 640px) {
  .room-columns {
    grid-template-columns: 1fr;
  }
}
</style>
