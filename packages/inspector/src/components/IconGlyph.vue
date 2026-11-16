<script setup lang="ts">
export type IconName = 'activity' | 'arrow-down' | 'close' | 'database' | 'error' | 'filter' | 'help' | 'info' | 'layers' | 'qr' | 'rows' | 'search' | 'spark' | 'switch' | 'warning'

withDefaults(defineProps<{
  name: IconName
  size?: number
}>(), {
  size: 16,
})
</script>

<template>
  <svg
    class="icon-glyph"
    :class="`icon-${name}`"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <template v-if="name === 'search'">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.2 4.2" />
    </template>
    <template v-else-if="name === 'activity'">
      <path d="M3 12h3l2.1-6 3.8 12 2.2-7 1.7 4H21" />
    </template>
    <template v-else-if="name === 'database'">
      <ellipse cx="12" cy="5" rx="7.5" ry="3" />
      <path d="M4.5 5v7c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V5" />
      <path d="M4.5 12v7c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-7" />
    </template>
    <template v-else-if="name === 'layers'">
      <path d="m12 3 9 5-9 5-9-5 9-5Z" />
      <path d="m3 12 9 5 9-5" />
      <path d="m3 16 9 5 9-5" />
    </template>
    <template v-else-if="name === 'filter'">
      <path d="M4 5h16l-6.2 7.2v5.1l-3.6 1.8v-6.9L4 5Z" />
    </template>
    <template v-else-if="name === 'arrow-down'">
      <path d="M12 4v14" />
      <path d="m6.5 12.5 5.5 5.5 5.5-5.5" />
    </template>
    <template v-else-if="name === 'rows'">
      <rect x="4" y="5" width="16" height="3" rx="1" />
      <rect x="4" y="10.5" width="16" height="3" rx="1" />
      <rect x="4" y="16" width="16" height="3" rx="1" />
    </template>
    <template v-else-if="name === 'switch'">
      <path d="M5 7h13" />
      <path d="m15 4 3 3-3 3" />
      <path d="M19 17H6" />
      <path d="m9 14-3 3 3 3" />
    </template>
    <template v-else-if="name === 'close'">
      <path d="m7 7 10 10M17 7 7 17" />
    </template>
    <template v-else-if="name === 'info'">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 10.7v5.1" />
      <path d="M12 7.3h.01" />
    </template>
    <template v-else-if="name === 'help'">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.7 9.3a2.5 2.5 0 1 1 4.1 1.9c-.9.7-1.8 1.2-1.8 2.6" />
      <path d="M12 17.2h.01" />
    </template>
    <template v-else-if="name === 'qr'">
      <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4z" />
      <path d="M14 14h3v3h-3zM18 18h2v2h-2zM17 14h3" />
    </template>
    <template v-else-if="name === 'warning'">
      <path d="m12 3 9 16H3L12 3Z" />
      <path d="M12 9v4.2" />
      <path d="M12 16.4h.01" />
    </template>
    <template v-else-if="name === 'error'">
      <circle cx="12" cy="12" r="8.5" />
      <path d="m9 9 6 6M15 9l-6 6" />
    </template>
    <template v-else>
      <path d="M12 3.5 13.8 9l5.7 1.8-5.7 1.8L12 18l-1.8-5.4-5.7-1.8L10.2 9 12 3.5Z" />
      <path d="m19 3 .6 1.8L21.5 5l-1.9.6L19 7.5l-.6-1.9-1.9-.6 1.9-.2L19 3Z" />
    </template>
  </svg>
</template>
