import { none } from '@hookstate/core'
import { Quaternion, Vector3 } from 'three'

import { SelfPeerID } from '@etherealengine/common/src/interfaces/PeerID'
import { dispatchAction, getMutableState } from '@etherealengine/hyperflux'

import { Engine } from '../../ecs/classes/Engine'
import { EngineState } from '../../ecs/classes/EngineState'
import {
  getComponent,
  getMutableComponent,
  hasComponent,
  removeComponent,
  setComponent
} from '../../ecs/functions/ComponentFunctions'
import { createEntity, removeEntity } from '../../ecs/functions/EntityFunctions'
import { generatePhysicsObject } from '../../physics/functions/physicsObjectDebugFunctions'
import { UUIDComponent } from '../../scene/components/UUIDComponent'
import { setTransformComponent, TransformComponent } from '../../transform/components/TransformComponent'
import {
  NetworkObjectAuthorityTag,
  NetworkObjectComponent,
  NetworkObjectOwnedTag
} from '../components/NetworkObjectComponent'
import { WorldNetworkAction } from './WorldNetworkAction'

const receiveSpawnObject = (action: typeof WorldNetworkAction.spawnObject.matches._TYPE) => {
  const existingAvatar =
    WorldNetworkAction.spawnAvatar.matches.test(action) &&
    !!Engine.instance.getUserAvatarEntity(action.$from) &&
    action.uuid === action.$from
  if (existingAvatar) return

  const entity = createEntity()
  setComponent(entity, UUIDComponent, action.uuid)

  setComponent(entity, NetworkObjectComponent, {
    ownerId: action.$from,
    authorityPeerID: action.$peer ?? Engine.instance.worldNetwork?.peerID ?? SelfPeerID,
    networkId: action.networkId
  })

  const isAuthoritativePeer = !action.$peer || action.$peer === Engine.instance.worldNetwork?.peerID

  if (isAuthoritativePeer) {
    setComponent(entity, NetworkObjectAuthorityTag)
  }

  const isOwnedByMe = action.$from === Engine.instance.userId
  if (isOwnedByMe) {
    setComponent(entity, NetworkObjectOwnedTag)
  }

  const position = new Vector3()
  const rotation = new Quaternion()

  if (action.position) position.copy(action.position)
  if (action.rotation) rotation.copy(action.rotation)

  setTransformComponent(entity, position, rotation)
  const transform = getComponent(entity, TransformComponent)

  // set cached action refs to the new components so they stay up to date with future movements
  action.position = transform.position
  action.rotation = transform.rotation
}

const receiveRegisterSceneObject = (action: typeof WorldNetworkAction.registerSceneObject.matches._TYPE) => {
  const entity = UUIDComponent.entitiesByUUID[action.objectUuid]

  if (!entity) return console.warn('[WorldNetworkAction] Tried to register a scene entity that does not exist', action)

  setComponent(entity, NetworkObjectComponent, {
    ownerId: action.$from,
    authorityPeerID: action.$peer ?? Engine.instance.worldNetwork?.peerID ?? SelfPeerID,
    networkId: action.networkId
  })

  const isOwnedByMe = action.$from === Engine.instance.userId
  if (isOwnedByMe) {
    setComponent(entity, NetworkObjectOwnedTag)
    setComponent(entity, NetworkObjectAuthorityTag)
  } else {
    if (hasComponent(entity, NetworkObjectOwnedTag)) removeComponent(entity, NetworkObjectOwnedTag)
    if (hasComponent(entity, NetworkObjectAuthorityTag)) removeComponent(entity, NetworkObjectAuthorityTag)
  }
}

const receiveSpawnDebugPhysicsObject = (action: typeof WorldNetworkAction.spawnDebugPhysicsObject.matches._TYPE) => {
  generatePhysicsObject(action.config, action.config.spawnPosition, true, action.config.spawnScale)
}

const receiveDestroyObject = (action: ReturnType<typeof WorldNetworkAction.destroyObject>) => {
  const entity = Engine.instance.getNetworkObject(action.$from, action.networkId)
  if (!entity)
    return console.log(
      `Warning - tried to destroy entity belonging to ${action.$from} with ID ${action.networkId}, but it doesn't exist`
    )
  removeEntity(entity)
}

const receiveRequestAuthorityOverObject = (
  action: typeof WorldNetworkAction.requestAuthorityOverObject.matches._TYPE
) => {
  console.log('receiveRequestAuthorityOverObject', action, Engine.instance.userId)
  // Authority request can only be processed by owner
  if (Engine.instance.userId !== action.ownerId) return

  const ownerId = action.ownerId
  const entity = Engine.instance.getNetworkObject(ownerId, action.networkId)
  if (!entity)
    return console.log(
      `Warning - tried to get entity belonging to ${action.ownerId} with ID ${action.networkId}, but it doesn't exist`
    )

  /**
   * Custom logic for disallowing transfer goes here
   */

  dispatchAction(
    WorldNetworkAction.transferAuthorityOfObject({
      ownerId: action.ownerId,
      networkId: action.networkId,
      newAuthority: action.newAuthority
    })
  )
}

const receiveTransferAuthorityOfObject = (
  action: typeof WorldNetworkAction.transferAuthorityOfObject.matches._TYPE
) => {
  console.log('receiveTransferAuthorityOfObject', action)
  // Authority request can only be processed by owner
  if (action.$from !== action.ownerId) return

  const ownerId = action.ownerId
  const entity = Engine.instance.getNetworkObject(ownerId, action.networkId)
  if (!entity)
    return console.log(
      `Warning - tried to get entity belonging to ${action.ownerId} with ID ${action.networkId}, but it doesn't exist`
    )

  getMutableComponent(entity, NetworkObjectComponent).authorityPeerID.set(action.newAuthority)

  if (Engine.instance.worldNetwork.peerID === action.newAuthority) {
    if (hasComponent(entity, NetworkObjectAuthorityTag))
      return console.warn(`Warning - User ${Engine.instance.userId} already has authority over entity ${entity}.`)

    setComponent(entity, NetworkObjectAuthorityTag)
  } else {
    if (hasComponent(entity, NetworkObjectAuthorityTag)) removeComponent(entity, NetworkObjectAuthorityTag)
  }
}

const receiveSetUserTyping = (action: typeof WorldNetworkAction.setUserTyping.matches._TYPE) => {
  getMutableState(EngineState).usersTyping[action.$from].set(action.typing ? true : none)
}

export const WorldNetworkActionReceptor = {
  receiveSpawnObject,
  receiveRegisterSceneObject,
  receiveSpawnDebugPhysicsObject,
  receiveDestroyObject,
  receiveRequestAuthorityOverObject,
  receiveTransferAuthorityOfObject,
  receiveSetUserTyping
}
