<script setup lang="ts">
import AppLayout from '@/components/layout/AppLayout.vue'
import CollectionModal from '@/components/modals/CollectionModal.vue'
import ImportFolderModal from '@/components/modals/ImportFolderModal.vue'
import ProviderManagerModal from '@/components/modals/ProviderManagerModal.vue'
import SettingsModal from '@/components/modals/SettingsModal.vue'
import { useIpcSubscriptions } from '@/composables/useIpcSubscriptions'

useIpcSubscriptions()
</script>

<template>
  <AppLayout />
  <CollectionModal />
  <ImportFolderModal />
  <ProviderManagerModal />
  <SettingsModal />
</template>
