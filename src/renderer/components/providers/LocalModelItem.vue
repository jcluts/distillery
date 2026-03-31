<script setup lang="ts">
import { computed, ref } from 'vue'
import { Icon } from '@iconify/vue'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import ProgressBar from 'primevue/progressbar'

import { formatApproxSize, toPercent } from '@/lib/format'
import type { DownloadProgressEvent, ModelDefinition, ModelComponent } from '@/types'

const props = defineProps<{
  model: ModelDefinition
  diffusionQuantId: string
  textEncoderQuantId: string
  isReady: boolean
  downloadedByPath: Record<string, boolean>
  downloadStatusByPath: Record<string, DownloadProgressEvent>
}>()

const emit = defineEmits<{
  selectQuant: [component: Exclude<ModelComponent, 'vae'>, quantId: string]
  download: [component: ModelComponent, quantId?: string]
  cancelDownload: [relativePath: string]
  removeDownload: [relativePath: string]
}>()

const open = ref(!props.isReady)

function norm(p: string): string {
  return p.replace(/\\+/g, '/')
}

const normalizedDownloaded = computed(() =>
  Object.fromEntries(Object.entries(props.downloadedByPath).map(([k, v]) => [norm(k), v]))
)

const normalizedStatus = computed(() =>
  Object.fromEntries(Object.entries(props.downloadStatusByPath).map(([k, v]) => [norm(k), v]))
)

function isDownloaded(filePath: string): boolean {
  return !!normalizedDownloaded.value[norm(filePath)]
}

function getStatus(filePath: string): DownloadProgressEvent | undefined {
  return normalizedStatus.value[norm(filePath)]
}

// VAE helpers
const vaeFileName = computed(() => props.model.vae.file.split(/[\\/]/).pop() ?? props.model.vae.file)
const vaeDownloaded = computed(() => isDownloaded(props.model.vae.file))
const vaeStatus = computed(() => getStatus(props.model.vae.file))
const vaeDownloading = computed(
  () => !vaeDownloaded.value && vaeStatus.value?.status === 'downloading'
)
const vaeQueued = computed(() => !vaeDownloaded.value && vaeStatus.value?.status === 'queued')
const vaeFailed = computed(() => !vaeDownloaded.value && vaeStatus.value?.status === 'failed')
</script>

<template>
  <div class="rounded-md border border-default">
    <!-- Collapsible header -->
    <button
      type="button"
      class="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-emphasis"
      @click="open = !open"
    >
      <Icon
        icon="lucide:chevron-right"
        class="size-4 shrink-0 text-muted transition-transform"
        :class="open ? 'rotate-90' : ''"
      />
      <div class="min-w-0 flex-1">
        <div class="truncate text-sm font-medium">{{ model.name }}</div>
        <div class="truncate text-xs text-muted">{{ model.description }}</div>
      </div>
      <Tag
        :severity="isReady ? 'success' : 'warn'"
        :value="isReady ? 'Ready' : 'Setup Required'"
        class="gap-1"
      >
        <span
          class="size-2 shrink-0 rounded-full"
          :class="isReady ? 'bg-emerald-500' : 'bg-amber-500'"
        />
      </Tag>
    </button>

    <!-- Collapsible content -->
    <div v-if="open" class="px-3 pb-3 pt-1">
      <div class="grid grid-cols-2 gap-3">
        <!-- Diffusion column -->
        <div class="space-y-1">
          <div class="px-1 text-xs font-medium uppercase text-muted">Diffusion Model</div>
          <div class="space-y-0.5 rounded-md border border-default bg-emphasis/40 p-1.5">
            <button
              v-for="quant in model.diffusion.quants"
              :key="quant.id"
              type="button"
              class="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-sm transition-colors"
              :class="
                quant.id === diffusionQuantId
                  ? 'bg-primary/10'
                  : isDownloaded(quant.file) && quant.id !== diffusionQuantId
                    ? 'cursor-pointer hover:bg-emphasis'
                    : 'cursor-default opacity-70'
              "
              @click="isDownloaded(quant.file) && quant.id !== diffusionQuantId ? emit('selectQuant', 'diffusion', quant.id) : undefined"
            >
              <!-- Radio dot -->
              <span
                class="size-3 shrink-0 rounded-full border"
                :class="
                  quant.id === diffusionQuantId
                    ? 'border-primary bg-primary'
                    : isDownloaded(quant.file)
                      ? 'border-surface-400'
                      : 'border-surface-500'
                "
              />

              <!-- Label -->
              <span
                v-tooltip.bottom="quant.description"
                class="min-w-0 truncate"
                :class="quant.id === diffusionQuantId ? 'font-medium' : ''"
              >
                {{ quant.label }}
              </span>
              <Tag
                v-if="quant.label.toLowerCase().includes('balanced') || quant.description.toLowerCase().startsWith('balanced')"
                severity="secondary"
                class="text-[9px]"
                value="Rec."
              />

              <span class="flex-1" />
              <span class="shrink-0 text-[11px] text-muted">{{ formatApproxSize(quant.size) }}</span>

              <!-- Actions -->
              <div class="ml-1 shrink-0" @click.stop>
                <!-- Downloading -->
                <div v-if="!isDownloaded(quant.file) && getStatus(quant.file)?.status === 'downloading'" class="flex items-center gap-1">
                  <ProgressBar
                    :value="toPercent(getStatus(quant.file)!.downloadedBytes, getStatus(quant.file)!.totalBytes)"
                    :show-value="false"
                    class="!h-1.5 w-12"
                  />
                  <span class="w-7 text-right text-[10px] text-muted">
                    {{ toPercent(getStatus(quant.file)!.downloadedBytes, getStatus(quant.file)!.totalBytes) }}%
                  </span>
                  <Button text severity="secondary" size="small" class="!p-0.5" @click="emit('cancelDownload', quant.file)">
                    <Icon icon="lucide:x" class="size-3" />
                  </Button>
                </div>
                <!-- Queued -->
                <div v-else-if="!isDownloaded(quant.file) && getStatus(quant.file)?.status === 'queued'" class="flex items-center gap-1">
                  <Tag severity="warn" class="text-[10px]">
                    <Icon icon="lucide:clock-3" class="mr-1 size-3" />
                    Queued
                  </Tag>
                  <Button text severity="secondary" size="small" class="!p-0.5" @click="emit('cancelDownload', quant.file)">
                    <Icon icon="lucide:x" class="size-3" />
                  </Button>
                </div>
                <!-- Failed -->
                <Button
                  v-else-if="!isDownloaded(quant.file) && getStatus(quant.file)?.status === 'failed'"
                  outlined
                  severity="secondary"
                  size="small"
                  label="Retry"
                  @click="emit('download', 'diffusion', quant.id)"
                />
                <!-- Downloaded + active -->
                <span v-else-if="isDownloaded(quant.file) && quant.id === diffusionQuantId" class="inline-flex size-6 items-center justify-center text-emerald-500">
                  <Icon icon="lucide:check" class="size-3.5" />
                </span>
                <!-- Downloaded + not active -->
                <Button
                  v-else-if="isDownloaded(quant.file)"
                  text
                  severity="secondary"
                  size="small"
                  class="!p-0.5"
                  @click="emit('removeDownload', quant.file)"
                >
                  <Icon icon="lucide:trash-2" class="size-3" />
                </Button>
                <!-- Not downloaded -->
                <Button v-else outlined severity="secondary" size="small" class="!p-0.5" @click="emit('download', 'diffusion', quant.id)">
                  <Icon icon="lucide:download" class="size-3" />
                </Button>
              </div>
            </button>
          </div>
        </div>

        <!-- Text Encoder column -->
        <div class="space-y-1">
          <div class="px-1 text-xs font-medium uppercase text-muted">Text Encoder</div>
          <div class="space-y-0.5 rounded-md border border-default bg-emphasis/40 p-1.5">
            <button
              v-for="quant in model.textEncoder.quants"
              :key="quant.id"
              type="button"
              class="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-sm transition-colors"
              :class="
                quant.id === textEncoderQuantId
                  ? 'bg-primary/10'
                  : isDownloaded(quant.file) && quant.id !== textEncoderQuantId
                    ? 'cursor-pointer hover:bg-emphasis'
                    : 'cursor-default opacity-70'
              "
              @click="isDownloaded(quant.file) && quant.id !== textEncoderQuantId ? emit('selectQuant', 'textEncoder', quant.id) : undefined"
            >
              <span
                class="size-3 shrink-0 rounded-full border"
                :class="
                  quant.id === textEncoderQuantId
                    ? 'border-primary bg-primary'
                    : isDownloaded(quant.file)
                      ? 'border-surface-400'
                      : 'border-surface-500'
                "
              />

              <span
                v-tooltip.bottom="quant.description"
                class="min-w-0 truncate"
                :class="quant.id === textEncoderQuantId ? 'font-medium' : ''"
              >
                {{ quant.label }}
              </span>
              <Tag
                v-if="quant.label.toLowerCase().includes('balanced') || quant.description.toLowerCase().startsWith('balanced')"
                severity="secondary"
                class="text-[9px]"
                value="Rec."
              />

              <span class="flex-1" />
              <span class="shrink-0 text-[11px] text-muted">{{ formatApproxSize(quant.size) }}</span>

              <div class="ml-1 shrink-0" @click.stop>
                <div v-if="!isDownloaded(quant.file) && getStatus(quant.file)?.status === 'downloading'" class="flex items-center gap-1">
                  <ProgressBar
                    :value="toPercent(getStatus(quant.file)!.downloadedBytes, getStatus(quant.file)!.totalBytes)"
                    :show-value="false"
                    class="!h-1.5 w-12"
                  />
                  <span class="w-7 text-right text-[10px] text-muted">
                    {{ toPercent(getStatus(quant.file)!.downloadedBytes, getStatus(quant.file)!.totalBytes) }}%
                  </span>
                  <Button text severity="secondary" size="small" class="!p-0.5" @click="emit('cancelDownload', quant.file)">
                    <Icon icon="lucide:x" class="size-3" />
                  </Button>
                </div>
                <div v-else-if="!isDownloaded(quant.file) && getStatus(quant.file)?.status === 'queued'" class="flex items-center gap-1">
                  <Tag severity="warn" class="text-[10px]">
                    <Icon icon="lucide:clock-3" class="mr-1 size-3" />
                    Queued
                  </Tag>
                  <Button text severity="secondary" size="small" class="!p-0.5" @click="emit('cancelDownload', quant.file)">
                    <Icon icon="lucide:x" class="size-3" />
                  </Button>
                </div>
                <Button
                  v-else-if="!isDownloaded(quant.file) && getStatus(quant.file)?.status === 'failed'"
                  outlined
                  severity="secondary"
                  size="small"
                  label="Retry"
                  @click="emit('download', 'textEncoder', quant.id)"
                />
                <span v-else-if="isDownloaded(quant.file) && quant.id === textEncoderQuantId" class="inline-flex size-6 items-center justify-center text-emerald-500">
                  <Icon icon="lucide:check" class="size-3.5" />
                </span>
                <Button
                  v-else-if="isDownloaded(quant.file)"
                  text
                  severity="secondary"
                  size="small"
                  class="!p-0.5"
                  @click="emit('removeDownload', quant.file)"
                >
                  <Icon icon="lucide:trash-2" class="size-3" />
                </Button>
                <Button v-else outlined severity="secondary" size="small" class="!p-0.5" @click="emit('download', 'textEncoder', quant.id)">
                  <Icon icon="lucide:download" class="size-3" />
                </Button>
              </div>
            </button>
          </div>
        </div>
      </div>

      <!-- VAE Row -->
      <div class="mt-2 flex items-center gap-2 rounded-md border border-default px-2 py-1.5 text-sm">
        <span class="shrink-0 text-xs font-medium uppercase text-muted">VAE</span>
        <span class="truncate font-medium">{{ vaeFileName }}</span>
        <span class="shrink-0 text-xs text-muted">{{ formatApproxSize(model.vae.size) }}</span>
        <span class="flex-1" />

        <!-- Downloading -->
        <div v-if="vaeDownloading && vaeStatus" class="flex items-center gap-1">
          <ProgressBar
            :value="toPercent(vaeStatus.downloadedBytes, vaeStatus.totalBytes)"
            :show-value="false"
            class="!h-1.5 w-16"
          />
          <span class="w-8 text-right text-[10px] text-muted">
            {{ toPercent(vaeStatus.downloadedBytes, vaeStatus.totalBytes) }}%
          </span>
          <Button text severity="secondary" size="small" class="!p-0.5" @click="emit('cancelDownload', model.vae.file)">
            <Icon icon="lucide:x" class="size-3" />
          </Button>
        </div>
        <!-- Queued -->
        <div v-else-if="vaeQueued" class="flex items-center gap-1">
          <Tag severity="warn" class="text-[10px]">
            <Icon icon="lucide:clock-3" class="mr-1 size-3" />
            Queued
          </Tag>
          <Button text severity="secondary" size="small" class="!p-0.5" @click="emit('cancelDownload', model.vae.file)">
            <Icon icon="lucide:x" class="size-3" />
          </Button>
        </div>
        <!-- Failed -->
        <Button
          v-else-if="vaeFailed"
          outlined
          severity="secondary"
          size="small"
          label="Retry"
          @click="emit('download', 'vae')"
        />
        <!-- Ready -->
        <div v-else-if="vaeDownloaded" class="flex items-center gap-1">
          <Tag severity="success" class="gap-1">
            <Icon icon="lucide:check" class="size-3" />
            Ready
          </Tag>
          <Button text severity="secondary" size="small" class="!p-0.5" @click="emit('removeDownload', model.vae.file)">
            <Icon icon="lucide:trash-2" class="size-3" />
          </Button>
        </div>
        <!-- Not downloaded -->
        <Button v-else outlined severity="secondary" size="small" class="!p-0.5" @click="emit('download', 'vae')">
          <Icon icon="lucide:download" class="size-3" />
        </Button>
      </div>
    </div>
  </div>
</template>
