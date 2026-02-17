import * as React from 'react'
import { FolderOpen, Settings as SettingsIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { SectionHeader } from '@/components/ui/section-header'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/stores/ui-store'
import type { AppSettings, SettingsUpdate } from '@/types'

function FieldLabel({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <div className="text-xs font-medium text-muted-foreground">{children}</div>
}

function Row({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <div className="flex items-center gap-2">{children}</div>
}

function PathField({
  label,
  value,
  placeholder,
  onChange,
  onBrowse
}: {
  label: string
  value: string
  placeholder?: string
  onChange: (value: string) => void
  onBrowse: () => Promise<void>
}): React.JSX.Element {
  return (
    <div className="space-y-2">
      <FieldLabel>{label}</FieldLabel>
      <Row>
        <Input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
        <Button type="button" variant="secondary" size="icon" onClick={() => void onBrowse()}>
          <FolderOpen />
        </Button>
      </Row>
    </div>
  )
}

function BoolField({
  label,
  value,
  onChange
}: {
  label: string
  value: boolean
  onChange: (value: boolean) => void
}): React.JSX.Element {
  return (
    <div className="space-y-2">
      <FieldLabel>{label}</FieldLabel>
      <ToggleGroup
        type="single"
        value={value ? 'on' : 'off'}
        onValueChange={(v) => {
          if (!v) return
          onChange(v === 'on')
        }}
        className="justify-start gap-1"
      >
        <ToggleGroupItem value="on" size="sm">
          On
        </ToggleGroupItem>
        <ToggleGroupItem value="off" size="sm">
          Off
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  )
}

export function SettingsModal(): React.JSX.Element {
  const activeModals = useUIStore((s) => s.activeModals)
  const closeModal = useUIStore((s) => s.closeModal)

  const open = activeModals.includes('settings')

  const [loaded, setLoaded] = React.useState<AppSettings | null>(null)
  const [draft, setDraft] = React.useState<AppSettings | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const showEnginePath = import.meta.env.DEV

  React.useEffect(() => {
    if (!open) {
      setLoaded(null)
      setDraft(null)
      setSaving(false)
      setError(null)
      return
    }

    setSaving(false)
    setError(null)

    void window.api
      .getSettings()
      .then((s) => {
        setLoaded(s)
        setDraft(s)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err))
      })
  }, [open])

  const close = React.useCallback(() => {
    closeModal('settings')
  }, [closeModal])

  const update = <K extends keyof AppSettings>(key: K, value: AppSettings[K]): void => {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  const browseFolder = async (title: string): Promise<string | null> => {
    const paths = await window.api.showOpenDialog({
      title,
      properties: ['openDirectory']
    })

    if (!paths || paths.length === 0) return null
    return paths[0] ?? null
  }

  const canSave = !!draft && !saving

  const onSave = async (): Promise<void> => {
    if (!draft) return
    setSaving(true)
    setError(null)

    try {
      const updates: SettingsUpdate = {
        library_root: draft.library_root,
        engine_path: draft.engine_path,
        model_base_path: draft.model_base_path,
        offload_to_cpu: draft.offload_to_cpu,
        flash_attn: draft.flash_attn,
        vae_on_cpu: draft.vae_on_cpu,
        llm_on_cpu: draft.llm_on_cpu,
        confirm_before_delete: draft.confirm_before_delete
      }

      await window.api.saveSettings(updates)
      close()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close()
      }}
    >
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SettingsIcon className="size-5" />
            Settings
          </DialogTitle>
          <DialogDescription>
            Library location, model directory, and engine runtime flags.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-4">
            <div className="space-y-3">
              <SectionHeader>
                PATHS
              </SectionHeader>

              <PathField
                label="Library root"
                value={draft?.library_root ?? ''}
                placeholder="C:\\Users\\...\\Distillery\\Library"
                onChange={(v) => update('library_root', v)}
                onBrowse={async () => {
                  const selected = await browseFolder('Choose library root')
                  if (selected) update('library_root', selected)
                }}
              />

              {showEnginePath ? (
                <PathField
                  label="Engine base path (dev)"
                  value={draft?.engine_path ?? ''}
                  placeholder="C:\\path\\to\\resources\\cn-engine\\win32\\vulkan"
                  onChange={(v) => update('engine_path', v)}
                  onBrowse={async () => {
                    const selected = await browseFolder('Choose cn-engine directory')
                    if (selected) update('engine_path', selected)
                  }}
                />
              ) : null}

              <PathField
                label="Model directory"
                value={draft?.model_base_path ?? ''}
                placeholder="C:\\Users\\...\\distillery\\profiles\\Default\\models"
                onChange={(v) => update('model_base_path', v)}
                onBrowse={async () => {
                  const selected = await browseFolder('Choose model directory')
                  if (selected) update('model_base_path', selected)
                }}
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-3">
              <SectionHeader>
                ENGINE FLAGS
              </SectionHeader>

              <BoolField
                label="Offload to CPU"
                value={draft?.offload_to_cpu ?? true}
                onChange={(v) => update('offload_to_cpu', v)}
              />

              <BoolField
                label="Flash attention"
                value={draft?.flash_attn ?? true}
                onChange={(v) => update('flash_attn', v)}
              />

              <BoolField
                label="VAE on CPU"
                value={draft?.vae_on_cpu ?? false}
                onChange={(v) => update('vae_on_cpu', v)}
              />

              <BoolField
                label="LLM on CPU"
                value={draft?.llm_on_cpu ?? false}
                onChange={(v) => update('llm_on_cpu', v)}
              />
            </div>

            <Separator />

            <div className="space-y-3">
              <SectionHeader>
                BEHAVIOR
              </SectionHeader>

              <BoolField
                label="Confirm before delete"
                value={draft?.confirm_before_delete ?? true}
                onChange={(v) => update('confirm_before_delete', v)}
              />
            </div>

            <Separator />

            {error ? <div className={cn('text-sm', 'text-destructive')}>{error}</div> : null}

            {!loaded && open ? <div className="text-sm text-muted-foreground">Loading…</div> : null}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="secondary" onClick={close} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void onSave()} disabled={!canSave}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
