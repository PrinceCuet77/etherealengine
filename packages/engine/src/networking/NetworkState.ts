import { ChannelType } from '@etherealengine/common/src/interfaces/Channel'
import { PeerID } from '@etherealengine/common/src/interfaces/PeerID'
import { UserId } from '@etherealengine/common/src/interfaces/UserId'
import { defineState, getMutableState, getState, none } from '@etherealengine/hyperflux'

import { DataChannelType, Network } from './classes/Network'
import { SerializationSchema } from './serialization/Utils'

type RegistryFunction = (network: Network, dataChannel: DataChannelType, fromPeerID: PeerID, message: any) => void

export const NetworkState = defineState({
  name: 'NetworkState',
  initial: {
    hostIds: {
      media: null as UserId | null,
      world: null as UserId | null
    },
    // todo - move to Network.schemas
    networkSchema: {} as { [key: string]: SerializationSchema },
    networks: {} as { [key: UserId]: Network },
    config: {
      /** Allow connections to a world instance server */
      world: false,
      /** Allow connections to a media instance server */
      media: false,
      /** Allow connections to party media instances and friend functionality */
      friends: false,
      /** Use instance IDs in url */
      instanceID: false,
      /** Use room IDs in url */
      roomID: false
    }
  }
})

export const dataChannelRegistry = new Map<DataChannelType, RegistryFunction[]>()

export const webcamVideoDataChannelType = 'ee.core.webcamVideo.dataChannel' as DataChannelType
export const webcamAudioDataChannelType = 'ee.core.webcamAudio.dataChannel' as DataChannelType
export const screenshareVideoDataChannelType = 'ee.core.screenshareVideo.dataChannel' as DataChannelType
export const screenshareAudioDataChannelType = 'ee.core.screenshareAudio.dataChannel' as DataChannelType

export type MediaTagType =
  | typeof webcamVideoDataChannelType
  | typeof webcamAudioDataChannelType
  | typeof screenshareVideoDataChannelType
  | typeof screenshareAudioDataChannelType

// export const webcamMediaType = 'webcam'
// export const screenshareMediaType = 'screenshare'

// export type MediaType = typeof webcamMediaType | typeof screenshareMediaType

export type MediaStreamAppData = {
  mediaTag: MediaTagType
  peerID: PeerID
  direction: TransportDirection
  channelType: ChannelType
  channelId: string
  clientDirection?: 'recv' | 'send'
}

export type PeerMediaType = {
  paused: boolean
  producerId: string
  globalMute: boolean
  encodings: Array<{
    mimeType: 'video/rtx' | 'video/vp8' | 'video/h264' | 'video/vp9' | 'audio/opus' | 'audio/pcmu' | 'audio/pcma'
    payloadType: number
    clockRate: number
    parameters: any
    rtcpFeedback: any[]
  }>
  channelType: ChannelType
  channelId: string
}

export type TransportDirection = 'send' | 'receive'

export const addNetwork = (network: Network) => {
  getMutableState(NetworkState).networks[network.hostId].set(network)
}

export const removeNetwork = (network: Network) => {
  getMutableState(NetworkState).networks[network.hostId].set(none)
}

export const addDataChannelHandler = (dataChannelType: DataChannelType, handler: RegistryFunction) => {
  if (!dataChannelRegistry.has(dataChannelType)) {
    dataChannelRegistry.set(dataChannelType, [])
  }
  dataChannelRegistry.get(dataChannelType)!.push(handler)
}

export const removeDataChannelHandler = (dataChannelType: DataChannelType, handler: RegistryFunction) => {
  if (!dataChannelRegistry.has(dataChannelType)) return

  const index = dataChannelRegistry.get(dataChannelType)!.indexOf(handler)
  if (index === -1) return

  dataChannelRegistry.get(dataChannelType)!.splice(index, 1)

  if (dataChannelRegistry.get(dataChannelType)!.length === 0) {
    dataChannelRegistry.delete(dataChannelType)
  }
}

export const updateNetworkID = (network: Network, newHostId: UserId) => {
  const state = getMutableState(NetworkState)
  state.networks[network.hostId].set(none)
  state.networks[newHostId].set(network)
  state.networks[newHostId].hostId.set(newHostId)
}
