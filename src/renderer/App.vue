<script setup lang="ts">
import AppLayout from '@/components/layout/AppLayout.vue'
import CollectionModal from '@/components/modals/CollectionModal.vue'
import { useIpcSubscriptions } from '@/composables/useIpcSubscriptions'

useIpcSubscriptions()
</script>

<template>
  <UApp>
    <AppLayout />
    <CollectionModal />
  </UApp>
</template>
