<template>
  <div class="settings-view">
    <h1>Settings</h1>
    <p class="settings-desc">Configure API keys and select which models are available for games.</p>

    <div v-if="loading" class="loading">Loading providers...</div>

    <div v-for="provider in providers" :key="provider.id" class="provider-card">
      <div class="provider-header">
        <div class="provider-name">
          <span class="provider-enabled" :class="{ active: provider.enabled }" @click="toggleProvider(provider)">
            {{ provider.enabled ? 'ON' : 'OFF' }}
          </span>
          {{ provider.name }}
        </div>
        <span class="provider-status" :class="provider.has_key ? 'configured' : 'missing'">
          {{ provider.has_key ? 'Key set' : 'No key' }}
        </span>
      </div>

      <div class="provider-key">
        <input
          type="password"
          placeholder="API key or OAuth token"
          v-model="keyInputs[provider.id]"
          @keyup.enter="saveKey(provider)"
        />
        <button class="btn-small" @click="saveKey(provider)" :disabled="!keyInputs[provider.id]">Save Key</button>
      </div>

      <div class="model-list">
        <div v-for="model in provider.models" :key="model.id" class="model-row">
          <label class="model-toggle">
            <input type="checkbox" :checked="model.enabled" @change="toggleModel(model)" />
            <span class="model-name">{{ model.display_name }}</span>
            <span class="model-id">{{ model.model_id }}</span>
          </label>
          <button
            v-if="provider.has_key"
            class="btn-test"
            :class="{ testing: testStates[model.model_id]?.loading }"
            :disabled="testStates[model.model_id]?.loading"
            @click="testModel(model)"
          >
            {{ testStates[model.model_id]?.loading ? '...' : 'Test' }}
          </button>
        </div>

        <div v-for="model in provider.models" :key="'r-'+model.id">
          <div v-if="testStates[model.model_id]?.result" class="test-result" :class="testStates[model.model_id].result.ok ? 'test-ok' : 'test-fail'">
            <div class="test-q">Q: {{ testStates[model.model_id].result.question }}</div>
            <div v-if="testStates[model.model_id].result.ok" class="test-a">A: {{ testStates[model.model_id].result.answer }}</div>
            <div v-else class="test-err">Error: {{ testStates[model.model_id].result.error }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'

const providers = ref([])
const loading = ref(true)
const keyInputs = ref({})
const testStates = reactive({})

async function loadProviders() {
  loading.value = true
  const res = await fetch('/api/providers')
  providers.value = await res.json()
  loading.value = false
}

async function saveKey(provider) {
  const key = keyInputs.value[provider.id]
  if (!key) return
  await fetch(`/api/providers/${provider.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: key }),
  })
  keyInputs.value[provider.id] = ''
  await loadProviders()
}

async function toggleProvider(provider) {
  await fetch(`/api/providers/${provider.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled: !provider.enabled }),
  })
  await loadProviders()
}

async function toggleModel(model) {
  await fetch(`/api/models/${encodeURIComponent(model.id)}/toggle`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled: !model.enabled }),
  })
  await loadProviders()
}

async function testModel(model) {
  testStates[model.model_id] = { loading: true, result: null }
  try {
    const res = await fetch('/api/models/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modelId: model.model_id }),
    })
    const data = await res.json()
    testStates[model.model_id] = { loading: false, result: data }
  } catch (err) {
    testStates[model.model_id] = { loading: false, result: { ok: false, question: '?', error: err.message } }
  }
}

onMounted(loadProviders)
</script>
