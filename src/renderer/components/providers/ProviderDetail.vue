<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import Button from 'primevue/button'
import Divider from 'primevue/divider'
import InputText from 'primevue/inputtext'
import Tag from 'primevue/tag'

import ModelBrowser from '@/components/providers/ModelBrowser.vue'
import IdentityMappingSelect from '@/components/providers/IdentityMappingSelect.vue'
import { useProviderStore } from '@/stores/provider'
import { useModelBrowsingStore } from '@/stores/model-browsing'

const KEY_URLS: Record<string, string> = {
  fal: 'https://fal.ai/dashboard/keys',
  replicate: 'https://replicate.com/account/api-tokens',
  wavespeed: 'https://wavespeed.ai/account/api-keys'
}

const props = defineProps<{ providerId: string }>()

const providerStore = useProviderStore()
const browsingStore = useModelBrowsingStore()

const provider = computed(
  () => providerStore.providers.find((p) => p.providerId === props.providerId) ?? null
)
const connInfo = computed(() => providerStore.connectionStatus[props.providerId])
const connStat = computed(() => connInfo.value?.status ?? 'idle')
const userModels = computed(() => browsingStore.userModelsByProvider[props.providerId] ?? [])
const hasStoredKey = computed(() => providerStore.hasApiKey[props.providerId] ?? false)
const addedModelIds = computed(() => new Set(userModels.value.map((m) => m.modelId)))
const keyUrl = computed(() => KEY_URLS[props.providerId])
const browseMode = computed(() => provider.value?.browse?.mode ?? 'search')

// Local editing state
const apiKey = ref('')
const showKey = ref(false)
const isEditing = ref(false)
const saveError = ref<string | null>(null)

// Load models + reset editing state when provider changes
watch(
  () => props.providerId,
  () => {
    void browsingStore.loadUserModels(props.providerId)
    apiKey.value = ''
    showKey.value = false
    isEditing.value = false
    saveError.value = null
  },
  { immediate: true }
)

async function handleSaveKey(): Promise<void> {
  const settingsKey = provider.value?.auth?.settingsKey
  if (!settingsKey || !apiKey.value.trim()) return
  saveError.value = null
  try {
    await window.api.saveSettings({ [settingsKey]: apiKey.value.trim() })
    await providerStore.checkApiKeyPresence(props.providerId)
    isEditing.value = false
    apiKey.value = ''
    showKey.value = false
    void providerStore.testConnection(props.providerId)
  } catch (err) {
    saveError.value = err instanceof Error ? err.message : 'Failed to save API key'
  }
}

function startEditing(): void {
  isEditing.value = true
  saveError.value = null
}

function cancelEditing(): void {
  isEditing.value = false
  apiKey.value = ''
  showKey.value = false
  saveError.value = null
}

function openUrl(url: string): void {
  window.open(url, '_blank')
}

async function handleRemoveModel(modelId: string): Promise<void> {
  try {
    await browsingStore.removeUserModel(props.providerId, modelId)
  } catch {
    // ignore
  }
}
</script>

<template>
  <div v-if="!provider" class="flex h-full items-center justify-center text-sm text-muted">
    Provider not found
  </div>

  <div v-else class="h-full overflow-y-auto">
    <div class="space-y-5 pr-2">
      <!-- API Key Section: Editing / No Key -->
      <div v-if="isEditing || !hasStoredKey" class="space-y-1.5">
        <div class="flex items-center gap-2">
          <span class="shrink-0 text-xs font-medium uppercase text-muted">API Key</span>
          <div class="relative flex-1">
            <InputText
              :type="showKey ? 'text' : 'password'"
              :placeholder="`Enter ${provider.displayName ?? provider.providerId} API key`"
              :model-value="apiKey"
              class="w-full !pr-9"
              :class="saveError ? '!border-red-500' : ''"
              :autofocus="true"
              @update:model-value="apiKey = String($event)"
              @keydown.enter="apiKey.trim() ? handleSaveKey() : undefined"
              @keydown.escape="hasStoredKey ? cancelEditing() : undefined"
            />
            <button
              type="button"
              class="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-color"
              tabindex="-1"
              @click="showKey = !showKey"
            >
              <Icon :icon="showKey ? 'lucide:eye-off' : 'lucide:eye'" class="size-3.5" />
            </button>
          </div>
          <Button size="small" :disabled="!apiKey.trim()" label="Save" @click="handleSaveKey" />
          <Button
            v-if="hasStoredKey"
            text
            severity="secondary"
            size="small"
            label="Cancel"
            @click="cancelEditing"
          />
          <Button
            v-if="keyUrl && !hasStoredKey"
            text
            severity="secondary"
            size="small"
            @click="openUrl(keyUrl!)"
          >
            <Icon icon="lucide:external-link" class="mr-1 size-3.5" />
            Get Key
          </Button>
        </div>
        <p v-if="saveError" class="pl-16 text-xs text-red-400">{{ saveError }}</p>
      </div>

      <!-- API Key Section: Saved -->
      <div v-else class="flex items-center gap-2">
        <span class="shrink-0 text-xs font-medium uppercase text-muted">API Key</span>
        <span class="select-none text-xs tracking-wider text-muted">••••••••••••</span>

        <Button text severity="secondary" size="small" @click="startEditing">
          <Icon icon="lucide:pencil" class="mr-1 size-3" />
          Edit
        </Button>

        <Button
          outlined
          severity="secondary"
          size="small"
          :disabled="connStat === 'testing'"
          :loading="connStat === 'testing'"
          label="Test"
          @click="providerStore.testConnection(providerId)"
        />

        <Button v-if="keyUrl" text severity="secondary" size="small" @click="openUrl(keyUrl!)">
          <Icon icon="lucide:external-link" class="mr-1 size-3.5" />
          Get Key
        </Button>

        <Tag v-if="connStat === 'success'" severity="success" class="gap-1">
          <Icon icon="lucide:check" class="size-3" />
          Connected
        </Tag>
        <Tag
          v-if="connStat === 'error'"
          severity="danger"
          class="max-w-[200px] gap-1 truncate"
          :title="connInfo?.message"
        >
          <Icon icon="lucide:x" class="size-3 shrink-0" />
          {{ connInfo?.message || 'Failed' }}
        </Tag>
      </div>

      <Divider />

      <!-- Model Browser -->
      <div class="space-y-3">
        <span class="text-xs font-medium uppercase text-muted">Browse Models</span>
        <ModelBrowser
          :provider-id="providerId"
          :browse-mode="browseMode"
          :added-model-ids="addedModelIds"
          :has-api-key="hasStoredKey"
        />
      </div>

      <!-- Added Models -->
      <div v-if="userModels.length > 0" class="space-y-3">
        <div class="flex items-center gap-2">
          <span class="text-xs font-medium uppercase text-muted">Added Models</span>
          <Tag severity="secondary" class="text-[10px]" :value="String(userModels.length)" />
        </div>

        <div class="space-y-1">
          <div
            v-for="model in userModels"
            :key="model.modelId"
            class="flex items-center gap-2 rounded-md border border-default px-3 py-2 text-sm"
          >
            <div class="flex min-w-0 flex-1 items-center gap-1.5 truncate">
              <span class="truncate">{{ model.name }}</span>
              <template v-if="model.modelId !== model.name">
                <span class="shrink-0 opacity-30">·</span>
                <span class="truncate text-muted">{{ model.modelId }}</span>
              </template>
            </div>

            <IdentityMappingSelect
              :provider-id="providerId"
              :model-id="model.modelId"
              :current-identity-id="model.modelIdentityId"
            />

            <Button
              text
              severity="secondary"
              size="small"
              :aria-label="`Remove ${model.name}`"
              class="!text-muted hover:!text-red-400"
              @click="handleRemoveModel(model.modelId)"
            >
              <Icon icon="lucide:trash-2" class="size-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
