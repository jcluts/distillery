import { useState } from 'react'
import type { FormFieldConfig } from '@/lib/schema-to-form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Dices } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SizeSelector } from './SizeSelector'
import { LocalSizeSelector } from './LocalSizeSelector'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FormFieldProps {
  field: FormFieldConfig
  value: unknown
  onChange: (value: unknown) => void
  disabled?: boolean
  error?: string
  hideLabel?: boolean
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const generateRandomSeed = (): number => Math.floor(Math.random() * 2147483648)

// ---------------------------------------------------------------------------
// FormField
// ---------------------------------------------------------------------------

export function FormField({
  field,
  value,
  onChange,
  disabled = false,
  error,
  hideLabel = false
}: FormFieldProps): React.JSX.Element {
  const isSeedField = field.name.toLowerCase() === 'seed'
  const isNumericField = field.type === 'number' || field.type === 'slider'
  const isNumberField = field.type === 'number'
  const allowEmptyNumber = isNumberField && !field.required && field.default === undefined

  const numericFallback =
    value !== undefined && value !== null
      ? Number(value)
      : ((field.default as number | undefined) ?? field.min ?? 0)

  const [numericInput, setNumericInput] = useState(() => {
    if (!isNumericField) return ''
    if (allowEmptyNumber && (value === undefined || value === null)) return ''
    return String(numericFallback)
  })

  // Synchronize numericInput with external value prop
  const [prevPropValue, setPrevPropValue] = useState(value)
  if (value !== prevPropValue) {
    setPrevPropValue(value)
    if (isNumericField) {
      if (allowEmptyNumber && (value === undefined || value === null)) {
        setNumericInput('')
      } else {
        const next =
          value !== undefined && value !== null
            ? Number(value)
            : ((field.default as number | undefined) ?? field.min ?? 0)
        setNumericInput(String(next))
      }
    }
  }

  const clampNumeric = (n: number): number => {
    let next = n
    if (field.min !== undefined) next = Math.max(field.min, next)
    if (field.max !== undefined) next = Math.min(field.max, next)
    return next
  }

  const commitNumeric = (raw: string): void => {
    if (raw.trim() === '' || Number.isNaN(Number(raw))) {
      if (allowEmptyNumber) {
        onChange(undefined)
        setNumericInput('')
        return
      }
      const fallback = (field.default as number | undefined) ?? field.min ?? 0
      onChange(fallback)
      setNumericInput(String(fallback))
      return
    }

    const parsed = Number(raw)
    const clamped = clampNumeric(parsed)
    onChange(clamped)
    setNumericInput(String(clamped))
  }

  // -------------------------------------------------------------------------
  // Render input based on field type
  // -------------------------------------------------------------------------

  const renderInput = (): React.JSX.Element => {
    switch (field.type) {
      case 'text':
        return (
          <Input
            id={field.name}
            type="text"
            value={(value as string) || ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={
              field.placeholder || field.description || `Enter ${field.label.toLowerCase()}`
            }
            disabled={disabled}
          />
        )

      case 'textarea':
        return (
          <Textarea
            id={field.name}
            value={(value as string) || ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={
              field.placeholder || field.description || `Enter ${field.label.toLowerCase()}`
            }
            disabled={disabled}
            rows={4}
            className="resize-y"
            data-focus-prompt={field.name === 'prompt' ? 'true' : undefined}
          />
        )

      case 'number': {
        const hasSliderRange =
          field.default !== undefined && field.min !== undefined && field.max !== undefined
        const currentValue =
          value !== undefined && value !== null
            ? Number(value)
            : ((field.default as number) ?? field.min ?? 0)

        if (hasSliderRange) {
          return (
            <div className="flex items-center gap-3">
              <Slider
                value={[currentValue]}
                onValueChange={([v]) => {
                  onChange(v)
                  setNumericInput(String(v))
                }}
                min={field.min}
                max={field.max}
                step={field.step ?? 1}
                disabled={disabled}
                className="flex-1"
              />
              <Input
                id={field.name}
                type="number"
                value={numericInput}
                onChange={(e) => {
                  const val = e.target.value
                  setNumericInput(val)
                  if (val === '' || Number.isNaN(Number(val))) {
                    if (allowEmptyNumber) onChange(undefined)
                    return
                  }
                  onChange(Number(val))
                }}
                onBlur={() => commitNumeric(numericInput)}
                min={field.min}
                max={field.max}
                step={field.step}
                disabled={disabled}
                className="w-20 h-8 text-sm"
              />
            </div>
          )
        }

        // Number without full slider range (e.g. seed)
        return (
          <div className="flex items-center gap-2">
            <Input
              id={field.name}
              type="number"
              value={numericInput}
              onChange={(e) => {
                const val = e.target.value
                setNumericInput(val)
                if (val === '' || Number.isNaN(Number(val))) {
                  if (allowEmptyNumber) onChange(undefined)
                  return
                }
                onChange(Number(val))
              }}
              onBlur={() => commitNumeric(numericInput)}
              min={field.min}
              max={field.max}
              step={field.step}
              placeholder={field.default !== undefined ? `Default: ${field.default}` : 'Random'}
              disabled={disabled}
              className={isSeedField ? 'flex-1' : undefined}
            />
            {isSeedField && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      const next = generateRandomSeed()
                      onChange(next)
                      setNumericInput(String(next))
                    }}
                    disabled={disabled}
                    className="h-8 w-8"
                  >
                    <Dices className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p>Random seed</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        )
      }

      case 'slider': {
        const currentValue =
          value !== undefined && value !== null
            ? Number(value)
            : ((field.default as number) ?? field.min ?? 0)
        return (
          <div className="flex items-center gap-3">
            <Slider
              value={[currentValue]}
              onValueChange={([v]) => {
                onChange(v)
                setNumericInput(String(v))
              }}
              min={field.min ?? 0}
              max={field.max ?? 100}
              step={field.step ?? 1}
              disabled={disabled}
              className="flex-1"
            />
            <Input
              type="number"
              value={numericInput}
              onChange={(e) => {
                const val = e.target.value
                setNumericInput(val)
                if (val === '' || Number.isNaN(Number(val))) return
                onChange(Number(val))
              }}
              onBlur={() => commitNumeric(numericInput)}
              min={field.min}
              max={field.max}
              step={field.step}
              disabled={disabled}
              className="w-20 h-8 text-sm"
            />
          </div>
        )
      }

      case 'boolean':
        return (
          <div className="flex items-center space-x-2">
            <Switch
              id={field.name}
              checked={Boolean(value)}
              onCheckedChange={onChange}
              disabled={disabled}
            />
            <Label htmlFor={field.name} className="text-sm text-muted-foreground">
              {value ? 'Enabled' : 'Disabled'}
            </Label>
          </div>
        )

      case 'select': {
        const selectValue =
          value !== undefined && value !== null && value !== ''
            ? String(value)
            : field.default !== undefined
              ? String(field.default)
              : '__empty__'
        return (
          <Select
            value={selectValue}
            onValueChange={(v) => {
              if (v === '__empty__') {
                onChange(undefined)
                return
              }
              const originalOption = field.options?.find((opt) => String(opt) === v)
              onChange(originalOption !== undefined ? originalOption : v)
            }}
            disabled={disabled}
          >
            <SelectTrigger id={field.name}>
              <SelectValue placeholder={`Select ${field.label.toLowerCase()}`} />
            </SelectTrigger>
            <SelectContent>
              {!field.required && (
                <SelectItem value="__empty__" className="text-muted-foreground">
                  — None —
                </SelectItem>
              )}
              {field.options?.map((option) => (
                <SelectItem key={String(option)} value={String(option)}>
                  {String(option)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )
      }

      case 'size':
        return (
          <SizeSelector
            value={(value as string) || (field.default as string) || '1024*1024'}
            onChange={(v) => onChange(v)}
            disabled={disabled}
            min={field.min}
            max={field.max}
          />
        )

      case 'local-size':
        return (
          <LocalSizeSelector
            value={(value as string) || (field.default as string) || '1024*1024'}
            onChange={(v) => onChange(v)}
            disabled={disabled}
            min={field.min}
            max={field.max}
          />
        )

      default:
        return (
          <Input
            id={field.name}
            type="text"
            value={(value as string) || ''}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
          />
        )
    }
  }

  return (
    <div className="space-y-2">
      {!hideLabel && !field.hideLabel && (
        <div className="flex items-center gap-2">
          <Label
            htmlFor={field.name}
            className={cn(
              'text-xs font-medium',
              field.required && "after:content-['*'] after:ml-0.5 after:text-destructive",
              error && 'text-destructive'
            )}
          >
            {field.label}
          </Label>
          {field.min !== undefined &&
            field.max !== undefined &&
            field.type !== 'size' &&
            field.type !== 'local-size' && (
              <span className="text-xs text-muted-foreground">
                ({field.min}–{field.max})
              </span>
            )}
        </div>
      )}
      <div className={cn(error && '[&_input]:border-destructive [&_textarea]:border-destructive')}>
        {renderInput()}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {!error &&
        field.description &&
        field.type !== 'text' &&
        field.type !== 'textarea' &&
        field.type !== 'size' &&
        field.type !== 'local-size' && (
          <p className="text-xs text-muted-foreground">{field.description}</p>
        )}
    </div>
  )
}
