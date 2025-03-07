import { ILifecycleEventEmitter, ILogger, Registry } from 'behave-graph'
import { useEffect } from 'react'
import { matches, Validator } from 'ts-matches'

import { defineAction, defineActionQueue, defineState, removeActionQueue } from '@etherealengine/hyperflux'

import { Engine } from '../../ecs/classes/Engine'
import { Entity } from '../../ecs/classes/Entity'
import {
  addComponent,
  defineQuery,
  getComponent,
  hasComponent,
  removeComponent,
  removeQuery
} from '../../ecs/functions/ComponentFunctions'
import { defineSystem } from '../../ecs/functions/SystemFunctions'
import { ScenePrefabs } from '../../scene/systems/SceneObjectUpdateSystem'
import { BehaveGraphComponent, GraphDomainID } from '../components/BehaveGraphComponent'
import { RuntimeGraphComponent } from '../components/RuntimeGraphComponent'

export type BehaveGraphDomainType = {
  register: (registry: Registry, logger?: ILogger, ticker?: ILifecycleEventEmitter) => void
}

export type BehaveGraphSystemStateType = {
  domains: Record<GraphDomainID, BehaveGraphDomainType>
}

export const BehaveGraphSystemState = defineState({
  name: 'BehaveGraphSystemState',
  initial: {
    domains: {}
  } as BehaveGraphSystemStateType
})

export const BehaveGraphActions = {
  execute: defineAction({
    type: 'BehaveGraph.EXECUTE',
    entity: matches.number as Validator<unknown, Entity>
  }),
  stop: defineAction({
    type: 'BehaveGraph.STOP',
    entity: matches.number as Validator<unknown, Entity>
  })
}

const graphQuery = defineQuery([BehaveGraphComponent])
const runtimeQuery = defineQuery([RuntimeGraphComponent])

const executeQueue = defineActionQueue(BehaveGraphActions.execute.matches)
const stopQueue = defineActionQueue(BehaveGraphActions.stop.matches)
function execute() {
  for (const entity of runtimeQuery.enter()) {
    const runtimeComponent = getComponent(entity, RuntimeGraphComponent)
    runtimeComponent.ticker.startEvent.emit()
    runtimeComponent.engine.executeAllSync()
  }

  for (const entity of runtimeQuery()) {
    const runtimeComponent = getComponent(entity, RuntimeGraphComponent)
    runtimeComponent.ticker.tickEvent.emit()
    runtimeComponent.engine.executeAllSync()
  }

  for (const action of executeQueue()) {
    const entity = action.entity
    if (hasComponent(entity, RuntimeGraphComponent)) {
      removeComponent(entity, RuntimeGraphComponent)
    }
    addComponent(entity, RuntimeGraphComponent)
  }

  for (const action of stopQueue()) {
    const entity = action.entity
    removeComponent(entity, RuntimeGraphComponent)
  }
}

const reactor = () => {
  useEffect(() => {
    Engine.instance.scenePrefabRegistry.set(ScenePrefabs.behaveGraph, [{ name: BehaveGraphComponent.jsonID }])

    return () => {
      Engine.instance.scenePrefabRegistry.delete(ScenePrefabs.behaveGraph)
    }
  }, [])
  return null
}

export const BehaveGraphSystem = defineSystem({
  uuid: 'ee.engine.BehaveGraphSystem',
  execute,
  reactor
})
