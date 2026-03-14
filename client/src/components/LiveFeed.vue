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
        <div v-else class="room-section">
          <div class="room-columns">
            <div class="room-col room-col-a">
              <div class="room-label">Room A</div>
              <LiveEvent
                v-for="(event, i) in group.roomA"
                :key="`a-${gi}-${i}`"
                :event="event"
                :playerRoles="playerRoles"
              />
            </div>
            <div class="room-col room-col-b">
              <div class="room-label">Room B</div>
              <LiveEvent
                v-for="(event, i) in group.roomB"
                :key="`b-${gi}-${i}`"
                :event="event"
                :playerRoles="playerRoles"
              />
            </div>
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

// Events that force a break in room columns (major phase transitions)
const BREAK_EVENTS = new Set(['round_start', 'exchange', 'game_over', 'game_start', 'hostage_selected'])

function eventRoom(e) {
  if (!ROOM_EVENTS.has(e.type)) return null
  return e.room || null
}

// Group events into alternating global / room-split sections.
// Narrator events between discussion turns are absorbed into the room section
// (displayed as spanning both columns) to avoid breaking the two-column layout.
const roomGroups = computed(() => {
  const groups = []
  let currentGlobal = []
  let currentRoomA = []
  let currentRoomB = []
  let currentSpanning = [] // global events within a room section (narrators between turns)
  let inRoomSection = false

  function flushRooms() {
    if (currentRoomA.length || currentRoomB.length || currentSpanning.length) {
      groups.push({ type: 'rooms', roomA: currentRoomA, roomB: currentRoomB, spanning: currentSpanning })
      currentRoomA = []
      currentRoomB = []
      currentSpanning = []
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
    } else if (inRoomSection && !BREAK_EVENTS.has(e.type)) {
      // Minor global event within room section (e.g. narrator between turns):
      // keep it inside the room section as a spanning element
      currentSpanning.push(e)
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
.room-section {
  margin: 8px 0;
}

.room-columns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1px;
  background: var(--border);
  border-radius: 4px;
  overflow: hidden;
  align-items: start;
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

.room-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 4px 6px 2px;
  opacity: 0.5;
}

@media (max-width: 640px) {
  .room-columns {
    grid-template-columns: 1fr;
  }
}
</style>
