import _ from 'lodash'
import { DataConsumer, DataProducer } from 'mediasoup/node/lib/types'
import { Spark } from 'primus'

import { Instance } from '@etherealengine/common/src/interfaces/Instance'
import { PeerID } from '@etherealengine/common/src/interfaces/PeerID'
import { UserInterface } from '@etherealengine/common/src/interfaces/User'
import { UserId } from '@etherealengine/common/src/interfaces/UserId'
import { SpawnPoseComponent } from '@etherealengine/engine/src/avatar/components/SpawnPoseComponent'
import { respawnAvatar } from '@etherealengine/engine/src/avatar/functions/respawnAvatar'
import checkPositionIsValid from '@etherealengine/engine/src/common/functions/checkPositionIsValid'
import { performance } from '@etherealengine/engine/src/common/functions/performance'
import { Engine } from '@etherealengine/engine/src/ecs/classes/Engine'
import { getComponent } from '@etherealengine/engine/src/ecs/functions/ComponentFunctions'
import { DataChannelType } from '@etherealengine/engine/src/networking/classes/Network'
import { MessageTypes } from '@etherealengine/engine/src/networking/enums/MessageTypes'
import { NetworkPeerFunctions } from '@etherealengine/engine/src/networking/functions/NetworkPeerFunctions'
import { JoinWorldRequestData } from '@etherealengine/engine/src/networking/functions/receiveJoinWorld'
import { WorldState } from '@etherealengine/engine/src/networking/interfaces/WorldState'
import { updatePeers } from '@etherealengine/engine/src/networking/systems/OutgoingActionSystem'
import { GroupComponent } from '@etherealengine/engine/src/scene/components/GroupComponent'
import { TransformComponent } from '@etherealengine/engine/src/transform/components/TransformComponent'
import { dispatchAction, getMutableState, getState } from '@etherealengine/hyperflux'
import { Action } from '@etherealengine/hyperflux/functions/ActionFunctions'
import { Application } from '@etherealengine/server-core/declarations'
import config from '@etherealengine/server-core/src/appconfig'
import { localConfig } from '@etherealengine/server-core/src/config'
import multiLogger from '@etherealengine/server-core/src/ServerLogger'
import { ServerState } from '@etherealengine/server-core/src/ServerState'
import getLocalServerIp from '@etherealengine/server-core/src/util/get-local-server-ip'

import { InstanceServerState } from './InstanceServerState'
import { SocketWebRTCServerNetwork } from './SocketWebRTCServerFunctions'
import { closeTransport } from './WebRTCFunctions'

const logger = multiLogger.child({ component: 'instanceserver:network' })
const isNameRegex = /instanceserver-([a-zA-Z0-9]{5}-[a-zA-Z0-9]{5})/

export const setupSubdomain = async () => {
  const app = Engine.instance.api as Application
  let stringSubdomainNumber: string

  const serverState = getState(ServerState)
  const instanceServerState = getMutableState(InstanceServerState)

  if (config.kubernetes.enabled) {
    await cleanupOldInstanceservers(app)
    instanceServerState.instanceServer.set(await serverState.agonesSDK.getGameServer())

    // We used to provision subdomains for instanceservers, e.g. 00001.instanceserver.domain.com
    // This turned out to be unnecessary, and in fact broke Firefox's ability to connect via
    // UDP, so the following was commented out.
    // const name = app.instanceServer.objectMeta.name
    // const isIdentifier = isNameRegex.exec(name)!
    // stringSubdomainNumber = await getFreeSubdomain(isIdentifier[1], 0)
    // app.isSubdomainNumber = stringSubdomainNumber
    //
    // const Route53 = new AWS.Route53({ ...config.aws.route53.keys })
    // const params = {
    //   ChangeBatch: {
    //     Changes: [
    //       {
    //         Action: 'UPSERT',
    //         ResourceRecordSet: {
    //           Name: `${stringSubdomainNumber}.${config.instanceserver.domain}`,
    //           ResourceRecords: [{ Value: app.instanceserver.status.address }],
    //           TTL: 0,
    //           Type: 'A'
    //         }
    //       }
    //     ]
    //   },
    //   HostedZoneId: config.aws.route53.hostedZoneId
    // }
    // if (config.instanceserver.local !== true) await Route53.changeResourceRecordSets(params as any).promise()
  }

  // Set up our instanceserver according to our current environment
  const localIp = await getLocalServerIp(instanceServerState.isMediaInstance.value)
  const announcedIp = config.kubernetes.enabled
    ? instanceServerState.instanceServer.value.status.address
    : localIp.ipAddress

  localConfig.mediasoup.webRtcTransport.listenIps = [
    {
      ip: '0.0.0.0',
      announcedIp
    }
  ]
}

export async function getFreeSubdomain(isIdentifier: string, subdomainNumber: number): Promise<string> {
  const app = Engine.instance.api as Application

  const stringSubdomainNumber = subdomainNumber.toString().padStart(config.instanceserver.identifierDigits, '0')
  const subdomainResult = await app.service('instanceserver-subdomain-provision').find({
    query: {
      is_number: stringSubdomainNumber
    }
  })
  if ((subdomainResult as any).total === 0) {
    await app.service('instanceserver-subdomain-provision').create({
      allocated: true,
      is_number: stringSubdomainNumber,
      is_id: isIdentifier
    })

    await new Promise((resolve) =>
      setTimeout(async () => {
        resolve(true)
      }, 500)
    )

    const newSubdomainResult = (await app.service('instanceserver-subdomain-provision').find({
      query: {
        is_number: stringSubdomainNumber
      }
    })) as any
    if (newSubdomainResult.total > 0 && newSubdomainResult.data[0].gs_id === isIdentifier) return stringSubdomainNumber
    else return getFreeSubdomain(isIdentifier, subdomainNumber + 1)
  } else {
    const subdomain = (subdomainResult as any).data[0]
    if (subdomain.allocated === true || subdomain.allocated === 1) {
      return getFreeSubdomain(isIdentifier, subdomainNumber + 1)
    }
    await app.service('instanceserver-subdomain-provision').patch(subdomain.id, {
      allocated: true,
      is_id: isIdentifier
    })

    await new Promise((resolve) =>
      setTimeout(async () => {
        resolve(true)
      }, 500)
    )

    const newSubdomainResult = (await app.service('instanceserver-subdomain-provision').find({
      query: {
        is_number: stringSubdomainNumber
      }
    })) as any
    if (newSubdomainResult.total > 0 && newSubdomainResult.data[0].gs_id === isIdentifier) return stringSubdomainNumber
    else return getFreeSubdomain(isIdentifier, subdomainNumber + 1)
  }
}

export async function cleanupOldInstanceservers(app: Application): Promise<void> {
  const serverState = getState(ServerState)

  const instances = await app.service('instance').Model.findAndCountAll({
    offset: 0,
    limit: 1000,
    where: {
      ended: false
    }
  })
  const instanceservers = await serverState.k8AgonesClient.listNamespacedCustomObject(
    'agones.dev',
    'v1',
    'default',
    'gameservers'
  )

  await Promise.all(
    instances.rows.map((instance) => {
      if (!instance.ipAddress) return false
      const [ip, port] = instance.ipAddress.split(':')
      const match = (instanceservers?.body! as any).items.find((is) => {
        if (is.status.ports == null || is.status.address === '') return false
        const inputPort = is.status.ports.find((port) => port.name === 'default')
        return is.status.address === ip && inputPort.port.toString() === port
      })
      return match == null
        ? app.service('instance').patch(instance.id, {
            ended: true
          })
        : Promise.resolve()
    })
  )

  const isIds = (instanceservers?.body! as any).items.map((is) =>
    isNameRegex.exec(is.metadata.name) != null ? isNameRegex.exec(is.metadata.name)![1] : null
  )

  await app.service('instanceserver-subdomain-provision').patch(
    null,
    {
      allocated: false
    },
    {
      query: {
        is_id: {
          $nin: isIds
        }
      }
    }
  )

  return
}

/**
 * Returns true if a user has permission to access a specific instance
 * @param app
 * @param instance
 * @param userId
 * @returns
 */
export const authorizeUserToJoinServer = async (app: Application, instance: Instance, userId: UserId) => {
  const authorizedUsers = (await app.service('instance-authorized-user').find({
    query: {
      instanceId: instance.id,
      $limit: 0
    }
  })) as any
  if (authorizedUsers.total > 0) {
    const thisUserAuthorized = (await app.service('instance-authorized-user').find({
      query: {
        instanceId: instance.id,
        userId,
        $limit: 0
      }
    })) as any
    if (thisUserAuthorized.total === 0) {
      logger.info(`User "${userId}" not authorized to be on this server.`)
      return false
    }
  }
  return true
}

export function getUserIdFromPeerID(network: SocketWebRTCServerNetwork, sparkID: PeerID) {
  const client = Array.from(network.peers.values()).find((c) => c.peerID === sparkID)
  return client?.userId
}

export const handleConnectingPeer = async (network: SocketWebRTCServerNetwork, spark: Spark, user: UserInterface) => {
  const userId = user.id
  const avatarDetail = user.avatar
  const peerID = spark.id as PeerID

  // Create a new client object
  // and add to the dictionary
  const existingUser = Array.from(network.peers.values()).find((client) => client.userId === userId)
  const userIndex = existingUser ? existingUser.userIndex : network.userIndexCount++
  const peerIndex = network.peerIndexCount++

  network.peers.set(peerID, {
    userId,
    userIndex: userIndex,
    spark: spark,
    peerIndex,
    peerID,
    lastSeenTs: Date.now(),
    joinTs: Date.now(),
    media: {} as any,
    consumerLayers: {},
    stats: {},
    incomingDataConsumers: new Map<DataChannelType, DataConsumer>(),
    outgoingDataConsumers: new Map<DataChannelType, DataConsumer>(),
    dataProducers: new Map<string, DataProducer>()
  })

  if (!network.users.has(userId)) {
    network.users.set(userId, [peerID])
  } else {
    network.users.get(userId)!.push(peerID)
  }

  const worldState = getMutableState(WorldState)
  worldState.userNames[userId].set(user.name)
  worldState.userAvatarDetails[userId].set({
    avatarURL: avatarDetail.modelResource?.LOD0_url || '',
    thumbnailURL: avatarDetail.thumbnailResource?.LOD0_url || ''
  })

  network.userIDToUserIndex.set(userId, userIndex)
  network.userIndexToUserID.set(userIndex, userId)

  const spectating = network.peers.get(peerID)!.spectating

  const instanceServerState = getState(InstanceServerState)

  const app = Engine.instance.api as Application

  app.service('message').create(
    {
      targetObjectId: instanceServerState.instance.id,
      targetObjectType: 'instance',
      text: `${user.name} joined` + (spectating ? ' as spectator' : ''),
      isNotification: true
    },
    {
      'identity-provider': {
        userId: userId
      }
    }
  )
}

export async function handleJoinWorld(
  network: SocketWebRTCServerNetwork,
  spark: Spark,
  data: JoinWorldRequestData,
  messageId: string,
  userId: UserId,
  user: UserInterface
) {
  logger.info('Connect to world from ' + userId)

  const cachedActions = NetworkPeerFunctions.getCachedActionsForUser(userId).map((action) => {
    const _action = _.cloneDeep(action)
    // todo, can we ensure the server actions always has a peerID?
    if (!_action.$peer) _action.$peer = network.hostPeerID
    return _action
  })

  const peerID = spark.id as PeerID

  updatePeers(network)

  spark.write({
    type: MessageTypes.JoinWorld.toString(),
    data: {
      peerIndex: network.peerIDToPeerIndex.get(peerID)!,
      peerID,
      routerRtpCapabilities: network.routers.instance[0].rtpCapabilities,
      highResTimeOrigin: performance.timeOrigin,
      worldStartTime: Engine.instance.startTime,
      cachedActions
    },
    id: messageId
  })

  const instanceServerState = getState(InstanceServerState)
  if (data.inviteCode && !instanceServerState.isMediaInstance)
    await getUserSpawnFromInvite(network, user, data.inviteCode!)
}

const getUserSpawnFromInvite = async (
  network: SocketWebRTCServerNetwork,
  user: UserInterface,
  inviteCode: string,
  iteration = 0
) => {
  if (inviteCode) {
    const app = Engine.instance.api as Application
    const result = (await app.service('user').find({
      query: {
        action: 'invite-code-lookup',
        inviteCode: inviteCode
      }
    })) as any

    const users = result.data as UserInterface[]
    if (users.length > 0) {
      const inviterUser = users[0]
      if (inviterUser.instanceId === user.instanceId) {
        const selfAvatarEntity = Engine.instance.getUserAvatarEntity(user.id as UserId)
        if (!selfAvatarEntity) {
          if (iteration >= 100) {
            logger.warn(
              `User ${user.id} did not spawn their avatar within 5 seconds, abandoning attempts to spawn at inviter`
            )
            return
          }
          return setTimeout(() => getUserSpawnFromInvite(network, user, inviteCode, iteration + 1), 50)
        }
        const inviterUserId = inviterUser.id
        const inviterUserAvatarEntity = Engine.instance.getUserAvatarEntity(inviterUserId as UserId)
        if (!inviterUserAvatarEntity) {
          if (iteration >= 100) {
            logger.warn(
              `inviting user ${inviterUserId} did not have a spawned avatar within 5 seconds, abandoning attempts to spawn at inviter`
            )
            return
          }
          return setTimeout(() => getUserSpawnFromInvite(network, user, inviteCode, iteration + 1), 50)
        }
        const inviterUserTransform = getComponent(inviterUserAvatarEntity, TransformComponent)

        /** @todo find nearest valid spawn position, rather than 2 in front */
        const inviterUserObject3d = getComponent(inviterUserAvatarEntity, GroupComponent)[0]
        // Translate infront of the inviter
        inviterUserObject3d.translateZ(2)

        const validSpawnablePosition = checkPositionIsValid(inviterUserObject3d.position, false)

        if (validSpawnablePosition) {
          const spawnPoseComponent = getComponent(selfAvatarEntity, SpawnPoseComponent)
          spawnPoseComponent?.position.copy(inviterUserObject3d.position)
          spawnPoseComponent?.rotation.copy(inviterUserTransform.rotation)
          respawnAvatar(selfAvatarEntity)
        }
      } else {
        logger.warn('The user who invited this user in no longer on this instance.')
      }
    }
  }
}

export function handleIncomingActions(network: SocketWebRTCServerNetwork, spark: Spark, message) {
  if (!message) return
  const networkPeer = network.peers.get(spark.id as PeerID)
  if (!networkPeer) throw new Error('Received actions from a peer that does not exist: ' + JSON.stringify(message))

  const actions = /*decode(new Uint8Array(*/ message /*))*/ as Required<Action>[]
  for (const a of actions) {
    a.$peer = spark.id as PeerID
    a.$from = networkPeer.userId
    dispatchAction(a)
  }
  // logger.info('SERVER INCOMING ACTIONS: %s', JSON.stringify(actions))
}

export async function handleHeartbeat(network: SocketWebRTCServerNetwork, spark: Spark): Promise<any> {
  const peerID = spark.id as PeerID
  // logger.info('Got heartbeat from user ' + userId + ' at ' + Date.now())
  if (network.peers.has(peerID)) network.peers.get(peerID)!.lastSeenTs = Date.now()
}

export async function handleDisconnect(network: SocketWebRTCServerNetwork, spark: Spark): Promise<any> {
  const peerID = spark.id as PeerID
  const userId = getUserIdFromPeerID(network, peerID) as UserId
  const disconnectedClient = network.peers.get(peerID)
  if (!disconnectedClient) return logger.warn(`Tried to handle disconnect for peer ${peerID} but was not foudn`)
  // On local, new connections can come in before the old sockets are disconnected.
  // The new connection will overwrite the socketID for the user's client.
  // This will only clear transports if the client's socketId matches the socket that's disconnecting.
  if (peerID === disconnectedClient?.peerID) {
    const state = getMutableState(WorldState)
    const userName = state.userNames[userId].value

    const instanceServerState = getState(InstanceServerState)
    const app = Engine.instance.api as Application
    app.service('message').create(
      {
        targetObjectId: instanceServerState.instance.id,
        targetObjectType: 'instance',
        text: `${userName} left`,
        isNotification: true
      },
      {
        'identity-provider': {
          userId: userId
        }
      }
    )

    NetworkPeerFunctions.destroyPeer(network, peerID)
    updatePeers(network)
    logger.info(`Disconnecting user ${userId} on spark ${peerID}`)
    if (disconnectedClient?.instanceRecvTransport) disconnectedClient.instanceRecvTransport.close()
    if (disconnectedClient?.instanceSendTransport) disconnectedClient.instanceSendTransport.close()
    if (disconnectedClient?.channelRecvTransport) disconnectedClient.channelRecvTransport.close()
    if (disconnectedClient?.channelSendTransport) disconnectedClient.channelSendTransport.close()
  } else {
    logger.warn("Spark didn't match for disconnecting client.")
  }
}

export async function handleLeaveWorld(
  network: SocketWebRTCServerNetwork,
  spark: Spark,
  data,
  messageId: string
): Promise<any> {
  const peerID = spark.id as PeerID
  for (const [, transport] of Object.entries(network.mediasoupTransports))
    if (transport.appData.peerID === peerID) closeTransport(network, transport)
  if (network.peers.has(peerID)) {
    NetworkPeerFunctions.destroyPeer(network, peerID)
    updatePeers(network)
  }
  spark.write({ type: MessageTypes.LeaveWorld.toString(), id: messageId })
}
