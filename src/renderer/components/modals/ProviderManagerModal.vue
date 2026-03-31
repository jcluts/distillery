<script setup lang="ts">
import { computed } from 'vue'
import Dialog from 'primevue/dialog'

import ProviderManager from '@/components/providers/ProviderManager.vue'
import { useUIStore } from '@/stores/ui'

const uiStore = useUIStore()

const open = computed({
  get: () => uiStore.activeModals.includes('providers'),
  set: (val: boolean) => {
    if (!val) uiStore.closeModal('providers')
  }
})
</script>

<template>
  <Dialog
    v-model:visible="open"
    header="Models"
    modal
    :style="{ width: '1100px', height: '82vh' }"
    :closable="true"
    content-class="!p-4 flex flex-col min-h-0 flex-1 overflow-hidden"
  >
    <p class="mb-4 text-sm text-muted">
      Manage API providers, local models, and available endpoints
    </p>
    <div class="min-h-0 flex-1 overflow-hidden">
      <ProviderManager />
    </div>
  </Dialog>
</template>
