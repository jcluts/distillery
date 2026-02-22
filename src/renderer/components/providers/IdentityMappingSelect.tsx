import * as React from 'react'

import { Plus } from 'lucide-react'

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
import { SectionLabel } from '@/components/ui/section-label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { useModelBrowsingStore } from '@/stores/model-browsing-store'

const NONE_VALUE = '__none__'
const CREATE_VALUE = '__create__'

/** Slugify a display name into a kebab-case ID. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

interface IdentityMappingSelectProps {
  providerId: string
  modelId: string
  currentIdentityId?: string
}

export function IdentityMappingSelect({
  providerId,
  modelId,
  currentIdentityId
}: IdentityMappingSelectProps): React.JSX.Element {
  const identities = useModelBrowsingStore((s) => s.identities)
  const setModelIdentity = useModelBrowsingStore((s) => s.setModelIdentity)
  const loadIdentities = useModelBrowsingStore((s) => s.loadIdentities)

  const [showCreate, setShowCreate] = React.useState(false)
  const [newName, setNewName] = React.useState('')

  const derivedId = slugify(newName)

  const handleChange = (value: string): void => {
    if (value === CREATE_VALUE) {
      setNewName('')
      setShowCreate(true)
      return
    }
    if (value === NONE_VALUE) return
    void setModelIdentity(providerId, modelId, value)
  }

  const handleCreate = async (): Promise<void> => {
    const name = newName.trim()
    if (!name || !derivedId) return

    try {
      await window.api.identities.create(derivedId, name, '', {
        providerId,
        modelIds: [modelId]
      })
      await loadIdentities()
      await setModelIdentity(providerId, modelId, derivedId)
      setShowCreate(false)
      setNewName('')
    } catch {
      // ignore
    }
  }

  return (
    <>
      <Select value={currentIdentityId ?? NONE_VALUE} onValueChange={handleChange}>
        <SelectTrigger className="h-7 w-[140px] text-xs">
          <SelectValue placeholder="Link identity…" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE_VALUE}>
            <span className="text-muted-foreground">No identity</span>
          </SelectItem>
          <SelectSeparator />
          {identities.map((identity) => (
            <SelectItem key={identity.id} value={identity.id}>
              {identity.name}
            </SelectItem>
          ))}
          <SelectSeparator />
          <SelectItem value={CREATE_VALUE}>
            <span className="flex items-center gap-1">
              <Plus className="size-3" />
              Create new…
            </span>
          </SelectItem>
        </SelectContent>
      </Select>

      {/* Create Identity Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Create Model Identity</DialogTitle>
            <DialogDescription>
              A model identity groups the same model across different providers.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <SectionLabel>Name</SectionLabel>
              <Input
                placeholder="e.g. Flux 2 Klein 9B"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newName.trim()) void handleCreate()
                }}
                autoFocus
              />
            </div>
            {derivedId && (
              <p className="text-xs text-muted-foreground">
                ID: <span className="font-mono">{derivedId}</span>
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!newName.trim() || !derivedId}
              onClick={() => void handleCreate()}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
