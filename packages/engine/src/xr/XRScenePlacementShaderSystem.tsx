import { useEffect } from 'react'
import React from 'react'
import { Material, Mesh } from 'three'

import { getMutableState, ReactorProps, useHookstate } from '@etherealengine/hyperflux'

import { defineSystem } from '../ecs/functions/SystemFunctions'
import { createGroupQueryReactor, Object3DWithEntity } from '../scene/components/GroupComponent'
import { VisibleComponent } from '../scene/components/VisibleComponent'
import { XRState } from './XRState'
import { XRSystem } from './XRSystem'

type ScenePlacementMaterialType = {
  userData: {
    ScenePlacement?: {
      previouslyTransparent: boolean
      previousOpacity: number
    }
  }
}

const addShaderToObject = (object: Object3DWithEntity) => {
  const obj = object as any as Mesh<any, Material & ScenePlacementMaterialType>
  if (obj.material) {
    if (!obj.material.userData) obj.material.userData = {}
    const userData = obj.material.userData
    if (!userData.ScenePlacement) {
      userData.ScenePlacement = {
        previouslyTransparent: obj.material.transparent,
        previousOpacity: obj.material.opacity
      }
    }
    obj.material.transparent = true
    obj.material.opacity = 0.4
  }
}

const removeShaderFromObject = (object: Object3DWithEntity) => {
  const obj = object as any as Mesh<any, Material & ScenePlacementMaterialType>
  if (obj.material) {
    const userData = obj.material.userData
    if (userData?.ScenePlacement) {
      obj.material.transparent = userData.ScenePlacement.previouslyTransparent
      obj.material.opacity = userData.ScenePlacement.previousOpacity
      delete userData.ScenePlacement
    }
  }
}

/**
 * Updates materials with scene object placement opacity shader
 * @param world
 * @returns
 */

const ScenePlacementReactor = createGroupQueryReactor(
  function XRScenePLacementReactor({ obj }) {
    const xrState = getMutableState(XRState)
    const scenePlacementMode = useHookstate(xrState.scenePlacementMode)
    const sessionActive = useHookstate(xrState.sessionActive)

    useEffect(() => {
      const useShader = xrState.sessionActive.value && xrState.scenePlacementMode.value === 'placing'
      if (useShader) {
        obj.traverse(addShaderToObject)
        return () => {
          obj.traverse(removeShaderFromObject)
        }
      }
    }, [scenePlacementMode, sessionActive])

    return null
  },
  [VisibleComponent]
)

const reactor = ({ root }: ReactorProps) => {
  return <ScenePlacementReactor root={root} />
}

export const XRScenePlacementShaderSystem = defineSystem({
  uuid: 'ee.engine.XRScenePlacementShaderSystem',
  execute: () => {},
  reactor
})
