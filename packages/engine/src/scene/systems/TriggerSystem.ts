import { useEffect } from 'react'

import { Entity } from '../../ecs/classes/Entity'
import { defineQuery, getComponent, removeQuery } from '../../ecs/functions/ComponentFunctions'
import { defineSystem } from '../../ecs/functions/SystemFunctions'
import { CollisionComponent } from '../../physics/components/CollisionComponent'
import { ColliderHitEvent, CollisionEvents } from '../../physics/types/PhysicsTypes'
import { CallbackComponent } from '../components/CallbackComponent'
import { ColliderComponent } from '../components/ColliderComponent'
import { UUIDComponent } from '../components/UUIDComponent'

export const triggerEnter = (entity: Entity, triggerEntity: Entity, hit: ColliderHitEvent) => {
  const triggerComponent = getComponent(triggerEntity, ColliderComponent)
  if (!triggerComponent?.onEnter) return
  if (triggerComponent.target && !UUIDComponent.entitiesByUUID[triggerComponent.target]) return

  const targetEntity = triggerComponent.target ? UUIDComponent.entitiesByUUID[triggerComponent.target] : triggerEntity

  if (targetEntity) {
    const callbacks = getComponent(targetEntity, CallbackComponent)
    callbacks.get(triggerComponent.onEnter)?.(triggerEntity)
  }
}

export const triggerExit = (entity: Entity, triggerEntity: Entity, hit: ColliderHitEvent) => {
  const triggerComponent = getComponent(triggerEntity, ColliderComponent)
  if (!triggerComponent?.onExit) return
  if (triggerComponent.target && !UUIDComponent.entitiesByUUID[triggerComponent.target]) return
  const targetEntity = triggerComponent.target ? UUIDComponent.entitiesByUUID[triggerComponent.target] : triggerEntity

  if (targetEntity) {
    const callbacks = getComponent(targetEntity, CallbackComponent)
    callbacks.get(triggerComponent.onExit)?.(triggerEntity)
  }
}

const collisionQuery = defineQuery([CollisionComponent])

const execute = () => {
  for (const entity of collisionQuery()) {
    for (const [e, hit] of getComponent(entity, CollisionComponent)) {
      if (hit.type === CollisionEvents.TRIGGER_START) {
        triggerEnter(entity, e, hit)
      }
      if (hit.type === CollisionEvents.TRIGGER_END) {
        triggerExit(entity, e, hit)
      }
    }
  }
}

export const TriggerSystem = defineSystem({
  uuid: 'ee.engine.TriggerSystem',
  execute
})
