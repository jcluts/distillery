<script setup lang="ts">
import { onMounted } from 'vue'

import LocalModelItem from '@/components/providers/LocalModelItem.vue'
import { useModelStore } from '@/stores/model'

const modelStore = useModelStore()

onMounted(() => {
  void modelStore.hydrate()
})
</script>

<template>
  <div v-if="modelStore.loading && !modelStore.catalog" class="p-4 text-sm text-muted">
    Loading model catalog…
  </div>

  <div v-else-if="!modelStore.catalog || !modelStore.settings" class="p-4 text-sm text-muted">
    {{ modelStore.error ? `Unable to load model catalog: ${modelStore.error}` : 'Model catalog unavailable' }}
  </div>

  <div v-else class="h-full overflow-y-auto">
    <div class="space-y-1 pr-2">
      <div
        v-if="modelStore.error"
        class="rounded-md border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-400"
      >
        {{ modelStore.error }}
      </div>

      <LocalModelItem
        v-for="model in modelStore.catalog.models"
        :key="model.id"
        :model="model"
        :diffusion-quant-id="modelStore.settings.model_quant_selections?.[model.id]?.diffusionQuant ?? ''"
        :text-encoder-quant-id="modelStore.settings.model_quant_selections?.[model.id]?.textEncoderQuant ?? ''"
        :is-ready="modelStore.filesByModelId[model.id]?.isReady ?? false"
        :downloaded-by-path="
          Object.fromEntries(
            (modelStore.filesByModelId[model.id]?.files ?? []).map((f) => [f.relativePath, f.exists])
          )
        "
        :download-status-by-path="modelStore.downloadStatusByPath"
        @select-quant="(component, quantId) => modelStore.setModelQuantSelection(model.id, component, quantId)"
        @download="(component, quantId) => modelStore.downloadModelFile({ modelId: model.id, component, quantId })"
        @cancel-download="(relativePath) => modelStore.cancelModelDownload(relativePath)"
        @remove-download="(relativePath) => modelStore.removeModelFile({ modelId: model.id, relativePath })"
      />
    </div>
  </div>
</template>
