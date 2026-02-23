import * as React from 'react'
import { Download, Globe, HardDrive, X } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { useModelStore } from '@/stores/model-store'
import { useUIStore } from '@/stores/ui-store'
import { formatApproxSize, toPercent } from '@/lib/format'
import type { DownloadProgressEvent, ModelDefinition } from '@/types'
import { cn } from '@/lib/utils'

/* Model ID → recommended diffusion quant ID */
const RECOMMENDED_QUANTS: Record<string, string> = {
  'flux2-klein-4b': 'Q4_K_S'
}

function normalizeRelativePath(p: string): string {
  return p.replace(/\\+/g, '/')
}

/* ────────────────────────────────────────────────────────────────────────── */

interface ActiveSetup {
  modelId: string
  quantIndex: number
  /** Relative paths of the three files being downloaded (vae, diffusion, textEncoder) */
  files: string[]
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Root component                                                           */
/* ────────────────────────────────────────────────────────────────────────── */

export function ModelSetupWizard(): React.JSX.Element {
  const [activeSetup, setActiveSetup] = React.useState<ActiveSetup | null>(null)

  const catalog = useModelStore((s) => s.catalog)
  const downloadStatusByPath = useModelStore((s) => s.downloadStatusByPath)
  const downloadModelFile = useModelStore((s) => s.downloadModelFile)
  const setActiveModel = useModelStore((s) => s.setActiveModel)
  const setModelQuantSelection = useModelStore((s) => s.setModelQuantSelection)
  const cancelModelDownload = useModelStore((s) => s.cancelModelDownload)
  const openModal = useUIStore((s) => s.openModal)

  const models = React.useMemo(
    () => (catalog?.models ?? []).filter((m) => m.type === 'image-generation'),
    [catalog]
  )

  /* ── Start a download ─────────────────────────────────────────────────── */

  const startSetup = async (modelId: string, quantIndex: number): Promise<void> => {
    const model = models.find((m) => m.id === modelId)
    if (!model) return

    const diffQuant = model.diffusion.quants[quantIndex]
    const teQuant = model.textEncoder.quants[quantIndex]
    if (!diffQuant || !teQuant) return

    const files = [
      normalizeRelativePath(model.vae.file),
      normalizeRelativePath(diffQuant.file),
      normalizeRelativePath(teQuant.file)
    ]

    setActiveSetup({ modelId, quantIndex, files })

    // Configure the model before downloading
    await setModelQuantSelection(modelId, 'diffusion', diffQuant.id)
    await setModelQuantSelection(modelId, 'textEncoder', teQuant.id)
    await setActiveModel(modelId)

    // Enqueue all three downloads (sequential queue on the backend)
    await downloadModelFile({ modelId, component: 'vae' })
    await downloadModelFile({ modelId, component: 'diffusion', quantId: diffQuant.id })
    await downloadModelFile({ modelId, component: 'textEncoder', quantId: teQuant.id })
  }

  /* ── Cancel an in-progress setup ──────────────────────────────────────── */

  const cancelSetup = async (): Promise<void> => {
    if (!activeSetup) return
    for (const file of activeSetup.files) {
      await cancelModelDownload(file)
    }
    setActiveSetup(null)
  }

  /* ── Reset if downloads fail / get cancelled externally ───────────────── */

  React.useEffect(() => {
    if (!activeSetup) return

    const statuses = activeSetup.files.map((f) => downloadStatusByPath[f])
    const stillActive = statuses.some((s) => s?.status === 'downloading' || s?.status === 'queued')
    const anyTerminal = statuses.some((s) => s?.status === 'failed' || s?.status === 'cancelled')

    // If nothing is active and at least one file failed/cancelled, reset
    if (!stillActive && anyTerminal) {
      setActiveSetup(null)
    }
  }, [activeSetup, downloadStatusByPath])

  /* ── Render ───────────────────────────────────────────────────────────── */

  if (activeSetup) {
    return (
      <SetupProgress
        setup={activeSetup}
        downloadStatusByPath={downloadStatusByPath}
        onCancel={cancelSetup}
        models={models}
      />
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Get started by downloading a model for local generation, or connect a cloud API provider.
      </p>

      {/* Local generation */}
      <Card className="space-y-3 p-3">
        <div className="flex items-center gap-2">
          <HardDrive className="size-4 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium">Local generation</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Generate images on your own hardware &mdash; fully offline, no API key needed.
        </p>

        {models.map((model) => (
          <ModelGroup
            key={model.id}
            model={model}
            recommendedQuantId={RECOMMENDED_QUANTS[model.id]}
            onSelect={(quantIndex) => void startSetup(model.id, quantIndex)}
          />
        ))}

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => openModal('models')}
        >
          Manage local models
        </Button>
      </Card>

      {/* API providers */}
      <Card className="space-y-2 p-3">
        <div className="flex items-center gap-2">
          <Globe className="size-4 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium">API providers</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Generate images using cloud APIs from providers like fal, Replicate, or WaveSpeed &mdash;
          no model download required.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => openModal('providers')}
        >
          Set up API providers
        </Button>
      </Card>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Model group card                                                         */
/* ────────────────────────────────────────────────────────────────────────── */

function ModelGroup({
  model,
  recommendedQuantId,
  onSelect
}: {
  model: ModelDefinition
  recommendedQuantId?: string
  onSelect: (quantIndex: number) => void
}): React.JSX.Element {
  return (
    <div className="space-y-1.5">
      <div>
        <div className="text-xs font-medium">{model.name}</div>
        <div className="text-[11px] text-muted-foreground">{model.description}</div>
      </div>

      <div className="space-y-0.5">
        {model.diffusion.quants.map((diffQuant, idx) => {
          const teQuant = model.textEncoder.quants[idx]
          const totalSize = diffQuant.size + (teQuant?.size ?? 0) + model.vae.size
          const isRec = diffQuant.id === recommendedQuantId

          return (
            <button
              key={diffQuant.id}
              type="button"
              onClick={() => onSelect(idx)}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted/50',
                isRec && 'bg-primary/5'
              )}
            >
              <span className="min-w-0 flex-1 truncate text-sm">{diffQuant.label}</span>
              {isRec && (
                <Badge
                  variant="outline"
                  className="shrink-0 border-blue-500/25 bg-blue-500/10 px-1.5 py-0 text-[10px] text-blue-400"
                >
                  Recommended
                </Badge>
              )}
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {formatApproxSize(totalSize)}
              </span>
              <Download className="size-3.5 shrink-0 text-muted-foreground" />
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Download progress view                                                   */
/* ────────────────────────────────────────────────────────────────────────── */

function SetupProgress({
  setup,
  downloadStatusByPath,
  onCancel,
  models
}: {
  setup: ActiveSetup
  downloadStatusByPath: Record<string, DownloadProgressEvent>
  onCancel: () => void
  models: ModelDefinition[]
}): React.JSX.Element {
  const model = models.find((m) => m.id === setup.modelId)
  const diffQuant = model?.diffusion.quants[setup.quantIndex]
  const teQuant = model?.textEncoder.quants[setup.quantIndex]

  // Aggregate progress across all three files
  let totalBytes = 0
  let downloadedBytes = 0
  for (const file of setup.files) {
    const status = downloadStatusByPath[file]
    if (status) {
      totalBytes += status.totalBytes || 0
      downloadedBytes += status.downloadedBytes || 0
    }
  }

  // Fall back to catalog sizes when status hasn't arrived yet
  if (totalBytes === 0 && model && diffQuant && teQuant) {
    totalBytes = model.vae.size + diffQuant.size + teQuant.size
  }

  const pct = toPercent(downloadedBytes, totalBytes)

  // Determine which file is currently active for a human-readable label
  const downloadingFile = setup.files.findIndex(
    (f) => downloadStatusByPath[f]?.status === 'downloading'
  )

  let phaseLabel = 'Preparing…'
  if (downloadingFile === 0) phaseLabel = 'Downloading VAE…'
  else if (downloadingFile === 1) phaseLabel = 'Downloading model…'
  else if (downloadingFile === 2) phaseLabel = 'Downloading text encoder…'

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <div className="text-sm font-medium">Setting up {model?.name ?? 'model'}</div>
        <p className="text-xs text-muted-foreground">
          {diffQuant?.label} &mdash; {formatApproxSize(totalBytes)} total
        </p>
      </div>

      <Card className="space-y-3 p-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">{phaseLabel}</span>
          <span className="tabular-nums text-muted-foreground">{pct}%</span>
        </div>
        <Progress value={pct} className="h-2" />
        <div className="flex justify-end">
          <Button type="button" size="sm" variant="ghost" className="gap-1" onClick={onCancel}>
            <X className="size-3" />
            Cancel
          </Button>
        </div>
      </Card>
    </div>
  )
}
