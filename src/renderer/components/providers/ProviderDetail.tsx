import * as React from 'react'

import { Eye, EyeOff, ExternalLink, Loader2, Check, X as XIcon, Trash2, Pencil } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { SectionLabel } from '@/components/ui/section-label'
import { Separator } from '@/components/ui/separator'
import {
  Item,
  ItemContent,
  ItemTitle,
  ItemActions,
  ItemGroup
} from '@/components/ui/item'
import { cn } from '@/lib/utils'
import { ModelBrowser } from '@/components/providers/ModelBrowser'
import { IdentityMappingSelect } from '@/components/providers/IdentityMappingSelect'
import { useProviderStore } from '@/stores/provider-store'
import type { ProviderConfig } from '@/types'

// Provider key management URLs
const KEY_URLS: Record<string, string> = {
  fal: 'https://fal.ai/dashboard/keys',
  replicate: 'https://replicate.com/account/api-tokens',
  wavespeed: 'https://wavespeed.ai/account/api-keys'
}

interface ProviderDetailProps {
  providerId: string
}

export function ProviderDetail({ providerId }: ProviderDetailProps): React.JSX.Element {
  const providers = useProviderStore((s) => s.providers)
  const connectionStatus = useProviderStore((s) => s.connectionStatus)
  const testConnection = useProviderStore((s) => s.testConnection)
  const userModelsByProvider = useProviderStore((s) => s.userModelsByProvider)
  const removeUserModel = useProviderStore((s) => s.removeUserModel)
  const loadUserModels = useProviderStore((s) => s.loadUserModels)
  const hasApiKey = useProviderStore((s) => s.hasApiKey)
  const checkApiKeyPresence = useProviderStore((s) => s.checkApiKeyPresence)

  const provider = providers.find((p) => p.providerId === providerId) ?? null
  const connInfo = connectionStatus[providerId]
  const connStat = connInfo?.status ?? 'idle'
  const userModels = userModelsByProvider[providerId] ?? []
  const hasStoredKey = hasApiKey[providerId] ?? false

  // API key editing state (local — not persisted in store)
  const [apiKey, setApiKey] = React.useState('')
  const [showKey, setShowKey] = React.useState(false)
  const [isEditing, setIsEditing] = React.useState(false)
  const [saveError, setSaveError] = React.useState<string | null>(null)

  // Load user models when provider changes
  React.useEffect(() => {
    void loadUserModels(providerId)
  }, [providerId, loadUserModels])

  // Reset editing state when switching providers
  React.useEffect(() => {
    setApiKey('')
    setShowKey(false)
    setIsEditing(false)
    setSaveError(null)
  }, [providerId])

  const handleRemoveModel = async (modelId: string, modelName: string): Promise<void> => {
    try {
      await removeUserModel(providerId, modelId)
    } catch {
      console.warn(`[ProviderDetail] Failed to remove model "${modelName}" (${modelId})`)
    }
  }

  if (!provider) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Provider not found
      </div>
    )
  }

  const settingsKey = provider.auth?.settingsKey
  const keyUrl = KEY_URLS[providerId]

  const handleSaveKey = async (): Promise<void> => {
    if (!settingsKey || !apiKey.trim()) return
    setSaveError(null)
    try {
      await window.api.saveSettings({ [settingsKey]: apiKey.trim() })
      // Update store key presence cache
      await checkApiKeyPresence(providerId)
      setIsEditing(false)
      setApiKey('')
      setShowKey(false)
      // Auto-test connection after saving
      void testConnection(providerId)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save API key')
    }
  }

  const handleTestConnection = (): void => {
    void testConnection(providerId)
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-5 pr-2">
        {/* API Key Section */}
        <ApiKeySection
          provider={provider}
          apiKey={apiKey}
          showKey={showKey}
          isEditing={isEditing}
          hasStoredKey={hasStoredKey}
          connStat={connStat}
          connMessage={connInfo?.message}
          saveError={saveError}
          keyUrl={keyUrl}
          onApiKeyChange={setApiKey}
          onToggleShowKey={() => setShowKey((prev) => !prev)}
          onStartEditing={() => { setIsEditing(true); setSaveError(null) }}
          onCancelEditing={() => { setIsEditing(false); setApiKey(''); setShowKey(false); setSaveError(null) }}
          onSaveKey={handleSaveKey}
          onTestConnection={handleTestConnection}
        />

        <Separator />

        {/* Model Browser */}
        <div className="space-y-3">
          <SectionLabel>Browse Models</SectionLabel>
          <ModelBrowser
            providerId={providerId}
            browseMode={provider.browse?.mode ?? 'search'}
            addedModelIds={new Set(userModels.map((m) => m.modelId))}
          />
        </div>

        {/* Added Models */}
        {userModels.length > 0 && (
          <>
            <div className="space-y-3">
              <SectionLabel>
                Added Models
                <Badge variant="secondary" className="ml-2 text-[10px] px-1.5">
                  {userModels.length}
                </Badge>
              </SectionLabel>
              <ItemGroup>
                {userModels.map((model) => (
                  <Item key={model.modelId} variant="outline" size="sm" className="border-border">
                    <ItemContent>
                      <ItemTitle className="flex items-center gap-1.5 truncate">
                        <span className="truncate">{model.name}</span>
                        {model.modelId !== model.name && (
                          <>
                            <span className="shrink-0 text-muted-foreground/40">·</span>
                            <span className="truncate text-muted-foreground font-normal">{model.modelId}</span>
                          </>
                        )}
                      </ItemTitle>
                    </ItemContent>
                    <ItemActions>
                      <IdentityMappingSelect
                        providerId={providerId}
                        modelId={model.modelId}
                        currentIdentityId={model.modelIdentityId}
                      />
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => void handleRemoveModel(model.modelId, model.name)}
                        aria-label={`Remove ${model.name}`}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </ItemActions>
                  </Item>
                ))}
              </ItemGroup>
            </div>
          </>
        )}
      </div>
    </ScrollArea>
  )
}

// =============================================================================
// API Key Section (sub-component)
// Two states: saved (compact display row) or editing (input row).
// =============================================================================

interface ApiKeySectionProps {
  provider: ProviderConfig
  apiKey: string
  showKey: boolean
  isEditing: boolean
  hasStoredKey: boolean
  connStat: 'idle' | 'testing' | 'success' | 'error'
  connMessage?: string
  saveError?: string | null
  keyUrl?: string
  onApiKeyChange: (key: string) => void
  onToggleShowKey: () => void
  onStartEditing: () => void
  onCancelEditing: () => void
  onSaveKey: () => Promise<void>
  onTestConnection: () => void
}

function ApiKeySection({
  provider,
  apiKey,
  showKey,
  isEditing,
  hasStoredKey,
  connStat,
  connMessage,
  saveError,
  keyUrl,
  onApiKeyChange,
  onToggleShowKey,
  onStartEditing,
  onCancelEditing,
  onSaveKey,
  onTestConnection
}: ApiKeySectionProps): React.JSX.Element {
  // ── Editing state: input + Save/Cancel ──────────────────────────────────
  if (isEditing || !hasStoredKey) {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <SectionLabel className="shrink-0">API Key</SectionLabel>
          <div className="relative flex-1">
            <Input
              type={showKey ? 'text' : 'password'}
              placeholder={`Enter ${provider.displayName ?? provider.providerId} API key`}
              value={apiKey}
              onChange={(e) => onApiKeyChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && apiKey.trim()) void onSaveKey()
                if (e.key === 'Escape' && hasStoredKey) onCancelEditing()
              }}
              className={cn('pr-9', saveError && 'border-destructive')}
              autoFocus
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground"
              onClick={onToggleShowKey}
              tabIndex={-1}
            >
              {showKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            </Button>
          </div>
          <Button size="sm" disabled={!apiKey.trim()} onClick={() => void onSaveKey()}>
            Save
          </Button>
          {hasStoredKey && (
            <Button variant="ghost" size="sm" onClick={onCancelEditing}>
              Cancel
            </Button>
          )}
          {keyUrl && !hasStoredKey && (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => window.open(keyUrl, '_blank')}
            >
              <ExternalLink className="size-3.5" />
              Get Key
            </Button>
          )}
        </div>
        {saveError && (
          <p className="text-xs text-destructive pl-[4.5rem]">{saveError}</p>
        )}
      </div>
    )
  }

  // ── Saved state: masked indicator + actions ─────────────────────────────
  return (
    <div className="flex items-center gap-2">
      <SectionLabel className="shrink-0">API Key</SectionLabel>
      <span className="text-xs text-muted-foreground tracking-wider select-none">
        ••••••••••••
      </span>

      <Button variant="ghost" size="sm" className="h-7 px-2" onClick={onStartEditing}>
        <Pencil className="size-3" />
        Edit
      </Button>

      <Button
        variant="outline"
        size="sm"
        className="h-7"
        onClick={onTestConnection}
        disabled={connStat === 'testing'}
      >
        {connStat === 'testing' && <Loader2 className="size-3.5 animate-spin" />}
        Test
      </Button>

      {keyUrl && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-muted-foreground"
          onClick={() => window.open(keyUrl, '_blank')}
        >
          <ExternalLink className="size-3.5" />
          Get Key
        </Button>
      )}

      {/* Connection status badge */}
      {connStat === 'success' && (
        <Badge
          variant="secondary"
          className="gap-1 text-emerald-600 border-emerald-600/20 bg-emerald-600/10"
        >
          <Check className="size-3" />
          Connected
        </Badge>
      )}
      {connStat === 'error' && (
        <Badge
          variant="secondary"
          className={cn(
            'gap-1 border-destructive/20 text-destructive bg-destructive/10',
            'max-w-[200px] truncate'
          )}
          title={connMessage}
        >
          <XIcon className="size-3 shrink-0" />
          {connMessage || 'Failed'}
        </Badge>
      )}
    </div>
  )
}
