<template>
  <div v-if="session" class="session-inspector">
    <div class="session-header">
      <h3>{{ playerName }} <span class="session-role">({{ playerRole }})</span></h3>
      <span class="session-meta">{{ session.messageCount }} messages</span>
      <button class="close-btn" @click="$emit('close')">&times;</button>
    </div>

    <div class="session-messages" ref="messagesContainer">
      <!-- System prompt -->
      <div class="message system">
        <div class="message-label">SYSTEM PROMPT</div>
        <pre class="message-content">{{ session.systemPrompt }}</pre>
      </div>

      <!-- Conversation -->
      <div
        v-for="(msg, i) in session.messages"
        :key="i"
        class="message"
        :class="msg.role"
      >
        <div class="message-label">{{ msg.role === 'user' ? 'GAME' : playerName.toUpperCase() }}</div>
        <pre class="message-content">{{ msg.content }}</pre>
      </div>
    </div>
  </div>
  <div v-else class="session-inspector empty">
    <p>Select a player to inspect their session</p>
  </div>
</template>

<script setup>
import { watch, ref, nextTick } from 'vue'

const props = defineProps({
  session: { type: Object, default: null },
  playerName: { type: String, default: '' },
  playerRole: { type: String, default: '' },
})
defineEmits(['close'])

const messagesContainer = ref(null)

watch(() => props.session?.messageCount, async () => {
  await nextTick()
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
})
</script>

<style scoped>
.session-inspector {
  background: #12122a;
  border: 1px solid #2a2a4a;
  border-radius: 8px;
  margin: 8px 12px;
  display: flex;
  flex-direction: column;
  max-height: 500px;
  overflow: hidden;
}

.session-inspector.empty {
  padding: 20px;
  text-align: center;
  color: #666;
}

.session-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: #1a1a35;
  border-bottom: 1px solid #2a2a4a;
}

.session-header h3 {
  margin: 0;
  font-size: 0.9rem;
  color: #e0e0e0;
}

.session-role {
  color: #888;
  font-weight: 400;
}

.session-meta {
  font-size: 0.75rem;
  color: #666;
  margin-left: auto;
}

.close-btn {
  background: none;
  border: none;
  color: #888;
  font-size: 1.2rem;
  cursor: pointer;
  padding: 0 4px;
}
.close-btn:hover { color: #fff; }

.session-messages {
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.message {
  border-radius: 10px;
  padding: 8px 12px;
  max-width: 75%;
}

/* System: centered, full width */
.message.system {
  max-width: 100%;
  background: #1e1e3a;
  border: 1px solid #2a2a5a;
  align-self: center;
}

/* Game messages (user): left-aligned */
.message.user {
  align-self: flex-start;
  background: #1a2a1a;
  border: 1px solid #2a4a2a;
  border-radius: 10px 10px 10px 2px;
}

/* Player responses (assistant): right-aligned */
.message.assistant {
  align-self: flex-end;
  background: #2a1a3a;
  border: 1px solid #4a2a5a;
  border-radius: 10px 10px 2px 10px;
}

.message-label {
  font-size: 0.6rem;
  font-weight: 700;
  text-transform: uppercase;
  margin-bottom: 3px;
  letter-spacing: 0.05em;
}

.message.system .message-label { color: #6a6aaa; }
.message.user .message-label { color: #4a8a4a; }
.message.assistant .message-label { color: #8a4a8a; }

.message-content {
  margin: 0;
  font-size: 0.8rem;
  line-height: 1.4;
  color: #d0d0d0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: 'SF Mono', 'Fira Code', monospace;
}
</style>
