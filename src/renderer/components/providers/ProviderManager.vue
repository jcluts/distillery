<script setup lang="ts">
import { onMounted } from 'vue'

import ProviderSidebar from '@/components/providers/ProviderSidebar.vue'
import ProviderDetail from '@/components/providers/ProviderDetail.vue'
import LocalDetail from '@/components/providers/LocalDetail.vue'
import { useProviderStore } from '@/stores/provider'
import { useModelBrowsingStore } from '@/stores/model-browsing'
import { useModelStore } from '@/stores/model'

const providerStore = useProviderStore()
const browsingStore = useModelBrowsingStore()
const modelStore = useModelStore()

onMounted(async () => {
  await providerStore.loadProviders()
  void browsingStore.loadAllUserModels()
  void browsingStore.loadIdentities()
  void modelStore.hydrate()
})
</script>

<template>
  <div class="flex h-full min-h-0 gap-4">
    <div class="w-[200px] shrink-0">
      <ProviderSidebar />
    </div>

    <div class="min-w-0 flex-1">
      <LocalDetail v-if="providerStore.selectedProviderId === 'local'" />
      <ProviderDetail
        v-else-if="providerStore.selectedProviderId"
        :provider-id="providerStore.selectedProviderId"
      />
      <div v-else class="flex h-full items-center justify-center text-sm text-muted">
        Select a provider to configure
      </div>
    </div>
  </div>
</template>
