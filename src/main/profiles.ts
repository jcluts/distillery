import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'

export interface ProfilesConfig {
  activeProfile: string
  profiles: string[]
}

export const DEFAULT_PROFILE = 'Default'

let baseUserDataPath: string | null = null

function getBaseUserDataPath(): string {
  if (!baseUserDataPath) {
    baseUserDataPath = app.getPath('userData')
  }
  return baseUserDataPath
}

function getProfilesRootDir(): string {
  return path.join(getBaseUserDataPath(), 'profiles')
}

function getProfilesConfigPath(): string {
  return path.join(getBaseUserDataPath(), 'profiles.json')
}

/**
 * Ensure the profiles system is initialized on disk.
 *
 * Note: this uses the *base* (un-profiled) userData directory.
 */
export function initializeProfiles(): void {
  const profilesRootDir = getProfilesRootDir()
  const profilesConfigPath = getProfilesConfigPath()

  if (!fs.existsSync(profilesRootDir)) {
    fs.mkdirSync(profilesRootDir, { recursive: true })
  }

  if (!fs.existsSync(profilesConfigPath)) {
    const initialConfig: ProfilesConfig = {
      activeProfile: DEFAULT_PROFILE,
      profiles: [DEFAULT_PROFILE]
    }
    fs.writeFileSync(profilesConfigPath, JSON.stringify(initialConfig, null, 2), 'utf8')
  }

  ensureProfileDirectoryExists(DEFAULT_PROFILE)
}

export function getProfilesConfig(): ProfilesConfig {
  const profilesConfigPath = getProfilesConfigPath()

  try {
    if (fs.existsSync(profilesConfigPath)) {
      const parsed = JSON.parse(
        fs.readFileSync(profilesConfigPath, 'utf8')
      ) as Partial<ProfilesConfig>

      const activeProfile =
        typeof parsed.activeProfile === 'string' && parsed.activeProfile.trim()
          ? parsed.activeProfile
          : DEFAULT_PROFILE

      const profiles = Array.isArray(parsed.profiles)
        ? parsed.profiles.filter((p): p is string => typeof p === 'string' && !!p.trim())
        : [DEFAULT_PROFILE]

      const uniqueProfiles = Array.from(new Set([DEFAULT_PROFILE, ...profiles]))

      return {
        activeProfile,
        profiles: uniqueProfiles
      }
    }
  } catch (err) {
    console.error('[Profiles] Error reading profiles config:', err)
  }

  return {
    activeProfile: DEFAULT_PROFILE,
    profiles: [DEFAULT_PROFILE]
  }
}

export function saveProfilesConfig(config: ProfilesConfig): void {
  const profilesConfigPath = getProfilesConfigPath()

  try {
    fs.writeFileSync(profilesConfigPath, JSON.stringify(config, null, 2), 'utf8')
  } catch (err) {
    console.error('[Profiles] Error saving profiles config:', err)
  }
}

export function getProfileUserDataPath(profileName: string): string {
  return path.join(getProfilesRootDir(), profileName)
}

export function ensureProfileDirectoryExists(profileName: string): string {
  const profilePath = getProfileUserDataPath(profileName)
  if (!fs.existsSync(profilePath)) {
    fs.mkdirSync(profilePath, { recursive: true })
  }
  return profilePath
}

/**
 * Apply the currently-active profile by setting Electron's userData directory.
 *
 * This MUST be called early in app startup (before database/settings init).
 */
export function applyActiveProfileUserDataPath(): {
  baseUserDataPath: string
  activeProfile: string
  profileUserDataPath: string
} {
  initializeProfiles()

  const config = getProfilesConfig()

  const activeProfile = config.activeProfile || DEFAULT_PROFILE
  const profileUserDataPath = ensureProfileDirectoryExists(activeProfile)

  app.setPath('userData', profileUserDataPath)

  return {
    baseUserDataPath: getBaseUserDataPath(),
    activeProfile,
    profileUserDataPath
  }
}

/**
 * Set the active profile in the root profiles.json.
 *
 * Switching profiles requires an app restart; this function does NOT change
 * the current process' app.getPath('userData') value.
 */
export function setActiveProfile(profileName: string): void {
  const trimmed = profileName.trim()
  if (!trimmed) return

  const config = getProfilesConfig()

  if (!config.profiles.includes(trimmed)) {
    config.profiles.push(trimmed)
  }

  config.activeProfile = trimmed

  ensureProfileDirectoryExists(trimmed)
  saveProfilesConfig(config)
}

export function getCurrentProfileName(): string {
  return getProfilesConfig().activeProfile || DEFAULT_PROFILE
}

export function getBaseUserDataRoot(): string {
  return getBaseUserDataPath()
}
