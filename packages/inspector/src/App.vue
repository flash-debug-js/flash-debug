<script setup lang="ts">
import { ref } from 'vue'

const connected = ref(false)
const endpoint = ref('')
</script>

<template>
  <main class="inspector-shell">
    <header class="inspector-header">
      <div>
        <p class="eyebrow">FLASH DEBUG</p>
        <h1>Inspector</h1>
      </div>
      <span class="status" :class="{ connected }">
        {{ connected ? 'Connected' : 'Waiting' }}
      </span>
    </header>

    <section class="connect-card">
      <label for="endpoint">Debug endpoint</label>
      <div class="connect-row">
        <input id="endpoint" v-model="endpoint" placeholder="https://...trycloudflare.com" />
        <button type="button" @click="connected = endpoint.trim().length > 0">Connect</button>
      </div>
    </section>

    <section class="empty-state">
      <h2>Waiting for logs</h2>
      <p>Flutter, ADB and other debug sources will appear here.</p>
    </section>
  </main>
</template>
