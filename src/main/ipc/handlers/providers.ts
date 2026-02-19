import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../channels'
import type { ProviderManagerService } from '../../generation/api/provider-manager-service'
import type { ProviderModel } from '../../generation/api/types'
import type { ModelIdentityService } from '../../generation/catalog/model-identity-service'

export function registerProviderHandlers(options: {
  providerManagerService: ProviderManagerService
  modelIdentityService: ModelIdentityService
}): void {
  const { providerManagerService, modelIdentityService } = options

  ipcMain.handle(IPC_CHANNELS.PROVIDERS_GET_ALL, () => {
    return providerManagerService.getProviders()
  })

  ipcMain.handle(IPC_CHANNELS.PROVIDERS_GET_CONFIG, (_event, providerId: string) => {
    return providerManagerService.getProviderConfig(providerId)
  })

  ipcMain.handle(
    IPC_CHANNELS.PROVIDERS_SEARCH_MODELS,
    async (_event, providerId: string, query: string) => {
      return await providerManagerService.searchModels(providerId, query)
    }
  )

  ipcMain.handle(IPC_CHANNELS.PROVIDERS_LIST_MODELS, async (_event, providerId: string) => {
    return await providerManagerService.listModels(providerId)
  })

  ipcMain.handle(
    IPC_CHANNELS.PROVIDERS_FETCH_MODEL_DETAIL,
    async (_event, providerId: string, modelId: string) => {
      return await providerManagerService.fetchModelDetail(providerId, modelId)
    }
  )

  ipcMain.handle(IPC_CHANNELS.PROVIDERS_GET_USER_MODELS, (_event, providerId: string) => {
    return providerManagerService.getUserModels(providerId)
  })

  ipcMain.handle(
    IPC_CHANNELS.PROVIDERS_ADD_USER_MODEL,
    (_event, providerId: string, model: ProviderModel) => {
      providerManagerService.addUserModel(providerId, model)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.PROVIDERS_REMOVE_USER_MODEL,
    (_event, providerId: string, modelId: string) => {
      providerManagerService.removeUserModel(providerId, modelId)
    }
  )

  ipcMain.handle(IPC_CHANNELS.PROVIDERS_TEST_CONNECTION, async (_event, providerId: string) => {
    return await providerManagerService.testConnection(providerId)
  })

  ipcMain.handle(IPC_CHANNELS.IDENTITIES_GET_ALL, () => {
    return Object.values(modelIdentityService.loadIdentities())
  })

  ipcMain.handle(
    IPC_CHANNELS.IDENTITIES_CREATE,
    (
      _event,
      id: string,
      name: string,
      description: string,
      initialMapping?: { providerId: string; modelIds: string[] }
    ) => {
      return modelIdentityService.createIdentity(id, name, description, initialMapping)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.IDENTITIES_ADD_MAPPING,
    (_event, identityId: string, providerId: string, modelIds: string[]) => {
      modelIdentityService.addMapping(identityId, providerId, modelIds)
    }
  )
}
