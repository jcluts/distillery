<script setup lang="ts">
import AppLayout from '@/components/layout/AppLayout.vue'
import { useIpcSubscriptions } from '@/composables/useIpcSubscriptions'

useIpcSubscriptions()
</script>

<template>
  <UApp>
    <AppLayout />
  </UApp>
</template>
