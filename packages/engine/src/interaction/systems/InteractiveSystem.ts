import { Not } from 'bitecs'
import { Vector3 } from 'three'

import { defineState, getState } from '@etherealengine/hyperflux'
import { WebLayer3D } from '@etherealengine/xrui'

import { AvatarComponent } from '../../avatar/components/AvatarComponent'
import { getAvatarBoneWorldPosition } from '../../avatar/functions/avatarFunctions'
import { Engine } from '../../ecs/classes/Engine'
import { Entity } from '../../ecs/classes/Entity'
import {
  addComponent,
  defineQuery,
  getComponent,
  hasComponent,
  removeComponent,
  setComponent
} from '../../ecs/functions/ComponentFunctions'
import { defineSystem } from '../../ecs/functions/SystemFunctions'
import { HighlightComponent } from '../../renderer/components/HighlightComponent'
import {
  DistanceFromCameraComponent,
  setDistanceFromCameraComponent
} from '../../transform/components/DistanceComponents'
import { TransformComponent } from '../../transform/components/TransformComponent'
import { createTransitionState } from '../../xrui/functions/createTransitionState'
import { createXRUI } from '../../xrui/functions/createXRUI'
import { ObjectFitFunctions } from '../../xrui/functions/ObjectFitFunctions'
import { InteractableComponent } from '../components/InteractableComponent'
import { gatherAvailableInteractables } from '../functions/gatherAvailableInteractables'
import { createInteractUI } from '../functions/interactUI'
import { EquippableSystem } from './EquippableSystem'

export const InteractState = defineState({
  name: 'InteractState',
  initial: () => {
    return {
      /**
       * closest interactable to the player, in view of the camera, sorted by distance
       */
      available: [] as Entity[]
    }
  }
})

export type InteractiveType = {
  xrui: ReturnType<typeof createXRUI>
  update: (entity: Entity, xrui: ReturnType<typeof createXRUI>) => void
}

export const InteractiveUI = new Map<Entity, InteractiveType>()
export const InteractableTransitions = new Map<Entity, ReturnType<typeof createTransitionState>>()

const vec3 = new Vector3()

export const onInteractableUpdate = (entity: Entity, xrui: ReturnType<typeof createInteractUI>) => {
  const transform = getComponent(xrui.entity, TransformComponent)
  if (!transform || !getComponent(Engine.instance.localClientEntity, TransformComponent)) return
  transform.position.copy(getComponent(entity, TransformComponent).position)
  transform.rotation.copy(getComponent(entity, TransformComponent).rotation)
  transform.position.y += 1
  const transition = InteractableTransitions.get(entity)!
  getAvatarBoneWorldPosition(Engine.instance.localClientEntity, 'Hips', vec3)
  const distance = vec3.distanceToSquared(transform.position)
  const inRange = distance < 5
  if (transition.state === 'OUT' && inRange) {
    transition.setState('IN')
  }
  if (transition.state === 'IN' && !inRange) {
    transition.setState('OUT')
  }
  transition.update(Engine.instance.deltaSeconds, (opacity) => {
    xrui.container.rootLayer.traverseLayersPreOrder((layer: WebLayer3D) => {
      const mat = layer.contentMesh.material as THREE.MeshBasicMaterial
      mat.opacity = opacity
    })
  })
  ObjectFitFunctions.lookAtCameraFromPosition(xrui.container, transform.position)
}

export const getInteractiveUI = (entity: Entity) => InteractiveUI.get(entity)
export const removeInteractiveUI = (entity: Entity) => InteractiveUI.delete(entity)

export const addInteractableUI = (
  entity: Entity,
  xrui: ReturnType<typeof createXRUI>,
  update?: (entity: Entity, xrui: ReturnType<typeof createXRUI>) => void
) => {
  setComponent(entity, InteractableComponent)

  if (!update) {
    update = onInteractableUpdate
  }
  const transition = createTransitionState(0.25)
  transition.setState('OUT')
  InteractableTransitions.set(entity, transition)

  InteractiveUI.set(entity, { xrui, update })
}

const allInteractablesQuery = defineQuery([InteractableComponent])
const interactableQuery = defineQuery([InteractableComponent, Not(AvatarComponent), DistanceFromCameraComponent])

let gatherAvailableInteractablesTimer = 0

const execute = () => {
  gatherAvailableInteractablesTimer += Engine.instance.deltaSeconds
  // update every 0.3 seconds
  if (gatherAvailableInteractablesTimer > 0.3) gatherAvailableInteractablesTimer = 0

  // ensure distance component is set on all interactables
  for (const entity of allInteractablesQuery.enter()) {
    setDistanceFromCameraComponent(entity)
  }

  // TODO: refactor InteractiveUI to be ui-centric rather than interactable-centeric
  for (const entity of interactableQuery.exit()) {
    if (InteractableTransitions.has(entity)) InteractableTransitions.delete(entity)
    if (InteractiveUI.has(entity)) InteractiveUI.delete(entity)
    if (hasComponent(entity, HighlightComponent)) removeComponent(entity, HighlightComponent)
  }

  if (Engine.instance.localClientEntity) {
    const interactables = interactableQuery()

    for (const entity of interactables) {
      // const interactable = getComponent(entity, InteractableComponent)
      // interactable.distance = interactable.anchorPosition.distanceTo(
      //   getComponent(Engine.instance.localClientEntity, TransformComponent).position
      // )
      if (InteractiveUI.has(entity)) {
        const { update, xrui } = InteractiveUI.get(entity)!
        update(entity, xrui)
      }
    }

    if (gatherAvailableInteractablesTimer === 0) {
      gatherAvailableInteractables(interactables)
      const closestInteractable = getState(InteractState).available[0]
      for (const interactiveEntity of interactables) {
        if (interactiveEntity === closestInteractable) {
          if (!hasComponent(interactiveEntity, HighlightComponent)) {
            addComponent(interactiveEntity, HighlightComponent)
          }
        } else {
          if (hasComponent(interactiveEntity, HighlightComponent)) {
            removeComponent(interactiveEntity, HighlightComponent)
          }
        }
      }
    }
  }
}

export const InteractiveSystem = defineSystem({
  uuid: 'ee.engine.InteractiveSystem',
  execute
})
