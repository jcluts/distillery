<script setup lang="ts">
import AppLayout from '@/components/layout/AppLayout.vue'
import CollectionModal from '@/components/modals/CollectionModal.vue'
import GenerationDetailModal from '@/components/modals/GenerationDetailModal.vue'
import ImportFolderModal from '@/components/modals/ImportFolderModal.vue'
import PromptEditorModal from '@/components/modals/PromptEditorModal.vue'
import ProviderManagerModal from '@/components/modals/ProviderManagerModal.vue'
import SettingsModal from '@/components/modals/SettingsModal.vue'
import { useIpcSubscriptions } from '@/composables/useIpcSubscriptions'
import Toast from 'primevue/toast'

useIpcSubscriptions()
</script>

<template>
  <AppLayout />
  <CollectionModal />
  <GenerationDetailModal />
  <ImportFolderModal />
  <PromptEditorModal />
  <ProviderManagerModal />
  <SettingsModal />
  <Toast position="bottom-right" />
</template>
