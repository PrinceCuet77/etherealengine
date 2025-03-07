import { API } from '@etherealengine/client-core/src/API'
import { LocationInstanceConnectionAction } from '@etherealengine/client-core/src/common/services/LocationInstanceConnectionService'
import { accessAuthState } from '@etherealengine/client-core/src/user/services/AuthService'
import { UserId } from '@etherealengine/common/src/interfaces/UserId'
import logger from '@etherealengine/common/src/logger'
import { matches, Validator } from '@etherealengine/engine/src/common/functions/MatchesUtils'
import { defineAction, defineState, dispatchAction, getMutableState, useState } from '@etherealengine/hyperflux'

export type ActiveInstance = {
  id: string
  location: string
  currentUsers: number
  // todo: assignedAt so we can sort by most recent?
}

export const EditorActiveInstanceState = defineState({
  name: 'EditorActiveInstanceState',
  initial: () => ({
    activeInstances: [] as ActiveInstance[],
    fetching: false
  })
})

export const EditorActiveInstanceServiceReceptor = (action): any => {
  const state = getMutableState(EditorActiveInstanceState)
  matches(action)
    .when(EditorActiveInstanceAction.fetchingActiveInstances.matches, (action) => {
      return state.merge({ fetching: true })
    })
    .when(EditorActiveInstanceAction.fetchedActiveInstances.matches, (action) => {
      return state.merge({ activeInstances: action.activeInstances, fetching: false })
    })
}
/**@deprecated use getMutableState directly instead */
export const accessEditorActiveInstanceState = () => getMutableState(EditorActiveInstanceState)
/**@deprecated use useHookstate(getMutableState(...) directly instead */
export const useEditorActiveInstanceState = () => useState(accessEditorActiveInstanceState())

//Service
export const EditorActiveInstanceService = {
  provisionServer: async (locationId: string, instanceId: string, sceneId: string) => {
    logger.info({ locationId, instanceId, sceneId }, 'Provision World Server Editor')
    const token = accessAuthState().authUser.accessToken.value
    const provisionResult = await API.instance.client.service('instance-provision').find({
      query: {
        locationId: locationId,
        instanceId: instanceId,
        sceneId: sceneId,
        token: token
      }
    })
    if (provisionResult.ipAddress && provisionResult.port) {
      dispatchAction(
        LocationInstanceConnectionAction.serverProvisioned({
          instanceId: provisionResult.id as UserId,
          ipAddress: provisionResult.ipAddress,
          port: provisionResult.port,
          roomCode: provisionResult.roomCode,
          locationId: locationId!,
          sceneId: sceneId!
        })
      )
    }
  },
  getActiveInstances: async (sceneId: string) => {
    dispatchAction(EditorActiveInstanceAction.fetchingActiveInstances({}))
    const activeInstances = await API.instance.client.service('instances-active').find({
      query: { sceneId }
    })
    dispatchAction(EditorActiveInstanceAction.fetchedActiveInstances({ activeInstances }))
  }
}

//Action
export class EditorActiveInstanceAction {
  static fetchingActiveInstances = defineAction({
    type: 'ee.editor.EditorActiveInstance.FETCHING_ACTIVE_INSTANCES' as const
  })

  static fetchedActiveInstances = defineAction({
    type: 'ee.editor.EditorActiveInstance.FETCHED_ACTIVE_INSTANCES' as const,
    activeInstances: matches.array as Validator<unknown, ActiveInstance[]>
  })
}
