<template>
  <div class="app">
    <nav class="navbar">
      <router-link to="/" class="nav-brand">ArenAI</router-link>
      <div class="nav-links">
        <router-link to="/" exact-active-class="active">Games</router-link>
        <router-link to="/new" active-class="active">New Game</router-link>
        <router-link to="/stats" active-class="active">Stats</router-link>
        <router-link to="/elo" active-class="active">ELO</router-link>
        <router-link to="/tokens" active-class="active">Tokens</router-link>
        <router-link to="/settings" active-class="active">Settings</router-link>
      </div>
    </nav>
    <main class="main-content">
      <router-view />
    </main>
  </div>
</template>

<script setup>
</script>
