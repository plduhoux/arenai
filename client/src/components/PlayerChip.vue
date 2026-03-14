<template>
  <span
    class="player-chip"
    :class="[
      player.party,
      { dictator: player.role === 'dictator', dead: !player.alive },
    ]"
    :title="player.model || ''"
  >
    <span class="icon" :class="iconClass" />
    {{ player.name }}
    <template v-if="showRole"> ({{ player.role }})</template>
    <small v-if="showModel && player.model" class="chip-model">{{ shortModel(player.model) }}</small>
    <span v-if="!player.alive" class="badge-dead">dead</span>
  </span>
</template>

<script setup>
import { computed } from 'vue'
import { shortModel } from '../utils/format'

const props = defineProps({
  player: { type: Object, required: true },
  showRole: { type: Boolean, default: false },
  showModel: { type: Boolean, default: false },
})

const iconClass = computed(() => {
  if (props.player.role === 'dictator') return 'icon-dictator'
  return `icon-${props.player.party}`
})
</script>
