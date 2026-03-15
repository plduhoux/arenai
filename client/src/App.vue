<template>
  <div class="app">
    <nav class="navbar">
      <router-link to="/" class="nav-brand">ArenAI</router-link>
      <button class="burger-btn" @click="menuOpen = !menuOpen" :class="{ open: menuOpen }">
        <span></span><span></span><span></span>
      </button>
      <div class="nav-links" :class="{ open: menuOpen }">
        <router-link to="/" exact-active-class="active" @click="menuOpen = false">Games</router-link>
        <router-link to="/new" active-class="active" @click="menuOpen = false">New Game</router-link>
        <router-link to="/stats" active-class="active" @click="menuOpen = false">Stats</router-link>
        <router-link to="/settings" active-class="active" @click="menuOpen = false">Settings</router-link>
      </div>
    </nav>
    <div v-if="menuOpen" class="nav-overlay" @click="menuOpen = false"></div>
    <main class="main-content">
      <router-view />
    </main>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const menuOpen = ref(false)
</script>
