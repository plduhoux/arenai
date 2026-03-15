<template>
  <div class="app">
    <nav class="navbar">
      <router-link to="/" class="nav-brand">ArenAI</router-link>
      <button class="burger-btn" @click="menuOpen = !menuOpen" :class="{ open: menuOpen }">
        <span></span><span></span><span></span>
      </button>
      <div class="nav-links" :class="{ open: menuOpen }">
        <router-link to="/games" active-class="active" @click="menuOpen = false">Games</router-link>
        <router-link v-if="!isStatic" to="/new" active-class="active" @click="menuOpen = false">New Game</router-link>
        <router-link to="/stats" active-class="active" @click="menuOpen = false">Stats</router-link>
        <router-link v-if="!isStatic" to="/settings" active-class="active" @click="menuOpen = false">Settings</router-link>
      </div>
      <div v-if="menuOpen" class="nav-overlay" @click="menuOpen = false"></div>
    </nav>
    <main class="main-content">
      <router-view />
    </main>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { isStatic } from './composables/useApi'

const menuOpen = ref(false)
</script>
