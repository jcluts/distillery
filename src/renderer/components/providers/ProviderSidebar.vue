<script setup lang="ts">
import { computed } from 'vue'
import Tag from 'primevue/tag'
import Divider from 'primevue/divider'

import { useProviderStore } from '@/stores/provider'
import { useModelBrowsingStore } from '@/stores/model-browsing'
import { useModelStore } from '@/stores/model'

const providerStore = useProviderStore()
const browsingStore = useModelBrowsingStore()
const modelStore = useModelStore()

const apiProviders = computed(() =>
  providerStore.providers.filter((p) => p.executionMode === 'remote-async')
)

const localModelCount = computed(() => modelStore.catalog?.models.length ?? 0)

const allLocalReady = computed(() =>
  modelStore.catalog?.models.every((m) => modelStore.filesByModelId[m.id]?.isReady) ?? false
)

function selectProvider(id: string): void {
  providerStore.selectProvider(id)
}
</script>

<template>
  <div class="h-full overflow-y-auto">
    <div class="space-y-1 p-1">
      <button
        v-for="provider in apiProviders"
        :key="provider.providerId"
        type="button"
        class="flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors"
        :class="
          provider.providerId === providerStore.selectedProviderId
            ? 'border-primary/40 bg-primary/10'
            : 'border-transparent hover:bg-emphasis'
        "
        @click="selectProvider(provider.providerId)"
      >
        <span
          class="size-2 shrink-0 rounded-full"
          :class="providerStore.hasApiKey[provider.providerId] ? 'bg-emerald-500' : 'bg-surface-400'"
        />
        <span class="min-w-0 flex-1 truncate">
          {{ provider.displayName ?? provider.providerId }}
        </span>
        <Tag
          v-if="(browsingStore.userModelsByProvider[provider.providerId]?.length ?? 0) > 0"
          severity="secondary"
          class="text-[10px]"
          :value="String(browsingStore.userModelsByProvider[provider.providerId]?.length ?? 0)"
        />
      </button>

      <div v-if="apiProviders.length === 0" class="px-3 py-6 text-center text-xs text-muted">
        No API providers configured
      </div>

      <Divider />

      <button
        type="button"
        class="flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors"
        :class="
          providerStore.selectedProviderId === 'local'
            ? 'border-primary/40 bg-primary/10'
            : 'border-transparent hover:bg-emphasis'
        "
        @click="selectProvider('local')"
      >
        <span
          class="size-2 shrink-0 rounded-full"
          :class="allLocalReady ? 'bg-emerald-500' : 'bg-amber-500'"
        />
        <span class="min-w-0 flex-1">Local</span>
        <Tag severity="secondary" class="text-[10px]" :value="String(localModelCount)" />
      </button>
    </div>
  </div>
</template>
