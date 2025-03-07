import { Downgraded, none, State } from '@hookstate/core'
import React, { useEffect } from 'react'

import { ChannelType } from '@etherealengine/common/src/interfaces/Channel'
import { UserId } from '@etherealengine/common/src/interfaces/UserId'
import multiLogger from '@etherealengine/common/src/logger'
import { matches, matchesUserId, Validator } from '@etherealengine/engine/src/common/functions/MatchesUtils'
import { Engine } from '@etherealengine/engine/src/ecs/classes/Engine'
import { NetworkTopics } from '@etherealengine/engine/src/networking/classes/Network'
import { addNetwork, NetworkState, updateNetworkID } from '@etherealengine/engine/src/networking/NetworkState'
import {
  defineAction,
  defineState,
  dispatchAction,
  getMutableState,
  getState,
  useState
} from '@etherealengine/hyperflux'

import { API } from '../../API'
import { accessChatState } from '../../social/services/ChatService'
import { accessLocationState, LocationState } from '../../social/services/LocationService'
import { endVideoChat, leaveNetwork } from '../../transports/SocketWebRTCClientFunctions'
import {
  connectToNetwork,
  initializeNetwork,
  SocketWebRTCClientNetwork
} from '../../transports/SocketWebRTCClientFunctions'
import { AuthState } from '../../user/services/AuthService'
import { NetworkConnectionService } from './NetworkConnectionService'

const logger = multiLogger.child({ component: 'client-core:service:media-instance' })

type InstanceState = {
  ipAddress: string
  port: string
  channelType: ChannelType
  channelId: string
  roomCode: string
  videoEnabled: boolean
  provisioned: boolean
  connected: boolean
  readyToConnect: boolean
  connecting: boolean
}

//State
export const MediaInstanceState = defineState({
  name: 'MediaInstanceState',
  initial: () => ({
    instances: {} as { [id: string]: InstanceState },
    joiningNonInstanceMediaChannel: false
  })
})

export function useMediaNetwork() {
  const mediaNetworkState = useState(getMutableState(NetworkState).networks)
  const mediaHostId = useState(getMutableState(NetworkState).hostIds.media)
  return mediaHostId.value ? (mediaNetworkState[mediaHostId.value] as State<SocketWebRTCClientNetwork>) : null
}

export function useMediaInstance() {
  const mediaInstanceState = useState(getMutableState(MediaInstanceState).instances)
  const mediaHostId = useState(getMutableState(NetworkState).hostIds.media)
  return mediaHostId.value ? mediaInstanceState[mediaHostId.value] : null
}

export const MediaInstanceConnectionServiceReceptor = (action) => {
  const s = getMutableState(MediaInstanceState)
  matches(action)
    .when(MediaInstanceConnectionAction.serverProvisioned.matches, (action) => {
      getMutableState(NetworkState).hostIds.media.set(action.instanceId)
      addNetwork(initializeNetwork(action.instanceId, NetworkTopics.media))
      return s.instances[action.instanceId].set({
        ipAddress: action.ipAddress,
        port: action.port,
        channelType: action.channelType!,
        channelId: action.channelId!,
        roomCode: action.roomCode,
        videoEnabled: false,
        provisioned: true,
        readyToConnect: true,
        connected: false,
        connecting: false
      })
    })
    .when(MediaInstanceConnectionAction.serverConnecting.matches, (action) => {
      return s.instances[action.instanceId].connecting.set(true)
    })
    .when(MediaInstanceConnectionAction.serverConnected.matches, (action) => {
      s.joiningNonInstanceMediaChannel.set(false)
      return s.instances[action.instanceId].merge({
        connected: true,
        connecting: false,
        readyToConnect: false
      })
    })
    .when(MediaInstanceConnectionAction.enableVideo.matches, (action) => {
      return s.instances[action.instanceId].merge({
        videoEnabled: action.enableVideo
      })
    })
    .when(MediaInstanceConnectionAction.disconnect.matches, (action) => {
      return s.instances[action.instanceId].set(none)
    })
    .when(MediaInstanceConnectionAction.joiningNonInstanceMediaChannel.matches, (action) => {
      return s.joiningNonInstanceMediaChannel.set(true)
    })
    .when(MediaInstanceConnectionAction.changeActiveConnectionHostId.matches, (action) => {
      const currentNetwork = s.instances[action.currentInstanceId].get({ noproxy: true })
      const networkState = getMutableState(NetworkState)
      const currentNework = getState(NetworkState).networks[action.currentInstanceId]
      updateNetworkID(currentNework as SocketWebRTCClientNetwork, action.newInstanceId)
      networkState.hostIds.media.set(action.newInstanceId as UserId)
      s.instances.merge({ [action.newInstanceId]: currentNetwork })
      s.instances[action.currentInstanceId].set(none)
    })
}
/**@deprecated use getMutableState directly instead */
export const accessMediaInstanceConnectionState = () => getMutableState(MediaInstanceState)
/**@deprecated use useHookstate(getMutableState(...) directly instead */
export const useMediaInstanceConnectionState = () => useState(accessMediaInstanceConnectionState())

//Service
export const MediaInstanceConnectionService = {
  provisionServer: async (channelId?: string, createPrivateRoom = false) => {
    logger.info(`Provision Media Server, channelId: "${channelId}".`)
    const token = getState(AuthState).authUser.accessToken
    const provisionResult = await API.instance.client.service('instance-provision').find({
      query: {
        channelId,
        token,
        createPrivateRoom
      }
    })
    if (provisionResult.ipAddress && provisionResult.port) {
      console.log('current channels', accessChatState().channels.channels.value)
      dispatchAction(
        MediaInstanceConnectionAction.serverProvisioned({
          instanceId: provisionResult.id as UserId,
          ipAddress: provisionResult.ipAddress,
          port: provisionResult.port,
          roomCode: provisionResult.roomCode,
          channelId: channelId ? channelId : '',
          channelType: accessChatState().channels.channels.value.find((channel) => channel.id === channelId)!
            .channelType
        })
      )
    } else {
      dispatchAction(NetworkConnectionService.actions.noMediaServersAvailable({ instanceId: channelId! ?? '' }))
    }
  },
  connectToServer: async (instanceId: string, channelId: string) => {
    dispatchAction(MediaInstanceConnectionAction.serverConnecting({ instanceId }))
    const authState = getState(AuthState)
    const user = authState.user
    const { ipAddress, port } = getState(MediaInstanceState).instances[instanceId]

    const network = Engine.instance.mediaNetwork as SocketWebRTCClientNetwork
    logger.info({ primus: !!network.primus, network }, 'Connect To Media Server.')
    if (network.primus) {
      await endVideoChat(network, { endConsumers: true })
      leaveNetwork(network, false)
    }

    const locationState = getState(LocationState)
    const currentLocation = locationState.currentLocation.location

    dispatchAction(
      MediaInstanceConnectionAction.enableVideo({
        instanceId,
        enableVideo:
          currentLocation?.locationSetting?.videoEnabled === true ||
          !(
            currentLocation?.locationSetting?.locationType === 'showroom' &&
            user.locationAdmins?.find((locationAdmin) => locationAdmin.locationId === currentLocation?.id) == null
          )
      })
    )

    await connectToNetwork(network, { port, ipAddress, channelId })
  },
  resetServer: (instanceId: string) => {
    dispatchAction(MediaInstanceConnectionAction.disconnect({ instanceId }))
  },
  useAPIListeners: () => {
    useEffect(() => {
      const listener = (params) => {
        if (params.channelId != null) {
          dispatchAction(
            MediaInstanceConnectionAction.serverProvisioned({
              instanceId: params.instanceId,
              ipAddress: params.ipAddress,
              port: params.port,
              roomCode: params.roomCode,
              channelId: params.channelId,
              channelType: params.channelType
            })
          )
        }
      }
      API.instance.client.service('instance-provision').on('created', listener)
      return () => {
        API.instance.client.service('instance-provision').off('created', listener)
      }
    }, [])
  }
}

//Action
export class MediaInstanceConnectionAction {
  static serverProvisioned = defineAction({
    type: 'ee.client.MediaInstanceConnection.MEDIA_INSTANCE_SERVER_PROVISIONED' as const,
    instanceId: matchesUserId,
    ipAddress: matches.string,
    port: matches.string,
    roomCode: matches.string,
    channelType: matches.string as Validator<unknown, ChannelType>,
    channelId: matches.string
  })

  static serverConnecting = defineAction({
    type: 'ee.client.MediaInstanceConnection.MEDIA_INSTANCE_SERVER_CONNECTING' as const,
    instanceId: matches.string
  })

  static enableVideo = defineAction({
    type: 'ee.client.MediaInstanceConnection.MEDIA_INSTANCE_SERVER_VIDEO_ENABLED' as const,
    instanceId: matches.string,
    enableVideo: matches.boolean
  })

  static serverConnected = defineAction({
    type: 'ee.client.MediaInstanceConnection.MEDIA_INSTANCE_SERVER_CONNECTED' as const,
    instanceId: matches.string
  })

  static disconnect = defineAction({
    type: 'ee.client.MediaInstanceConnection.MEDIA_INSTANCE_SERVER_DISCONNECT' as const,
    instanceId: matches.string
  })

  static joiningNonInstanceMediaChannel = defineAction({
    type: 'ee.client.MediaInstanceConnection.JOINING_NON_INSTANCE_MEDIA_CHANNEL' as const
  })

  static changeActiveConnectionHostId = defineAction({
    type: 'ee.client.MediaInstanceConnection.MEDIA_INSTANCE_SERVER_CHANGE_HOST_ID' as const,
    currentInstanceId: matchesUserId,
    newInstanceId: matchesUserId
  })
}
