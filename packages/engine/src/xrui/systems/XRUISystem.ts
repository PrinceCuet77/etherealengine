import { useEffect } from 'react'
import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Quaternion,
  Ray,
  RingGeometry,
  SphereGeometry,
  Vector3
} from 'three'

import { getMutableState, getState } from '@etherealengine/hyperflux'
import { WebContainer3D, WebLayerManager } from '@etherealengine/xrui'

import { Engine } from '../../ecs/classes/Engine'
import { Entity } from '../../ecs/classes/Entity'
import { defineQuery, getComponent, hasComponent, removeQuery } from '../../ecs/functions/ComponentFunctions'
import { defineSystem } from '../../ecs/functions/SystemFunctions'
import { EngineRenderer } from '../../renderer/WebGLRendererSystem'
import { VisibleComponent } from '../../scene/components/VisibleComponent'
import { DistanceFromCameraComponent } from '../../transform/components/DistanceComponents'
import { ReferenceSpace } from '../../xr/XRState'
import { XRUIComponent, XRUIInteractableComponent } from '../components/XRUIComponent'
import { XRUIState } from '../XRUIState'

// pointer taken from https://github.com/mrdoob/three.js/blob/master/examples/webxr_vr_ballshooter.html
const createPointer = (inputSource: XRInputSource): PointerObject => {
  switch (inputSource.targetRayMode) {
    case 'gaze': {
      const geometry = new RingGeometry(0.02, 0.04, 32).translate(0, 0, -1)
      const material = new MeshBasicMaterial({ opacity: 0.5, transparent: true })
      return new Mesh(geometry, material) as PointerObject
    }
    default:
    case 'tracked-pointer': {
      const geometry = new BufferGeometry()
      geometry.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 0, 0, -1], 3))
      geometry.setAttribute('color', new Float32BufferAttribute([0.5, 0.5, 0.5, 0, 0, 0], 3))
      const material = new LineBasicMaterial({ vertexColors: true, blending: AdditiveBlending })
      return new Line(geometry, material)
    }
  }
}

const createUICursor = () => {
  const geometry = new SphereGeometry(0.01, 16, 16)
  const material = new MeshBasicMaterial({ color: 0xffffff })
  return new Mesh(geometry, material)
}

export type PointerObject = (Line<BufferGeometry, LineBasicMaterial> | Mesh<RingGeometry, MeshBasicMaterial>) & {
  targetRay?: Mesh<BufferGeometry, MeshBasicMaterial>
  cursor?: Mesh<BufferGeometry, MeshBasicMaterial>
  lastHit?: ReturnType<typeof WebContainer3D.prototype.hitTest> | null
}

const hitColor = new Color(0x00e6e6)
const normalColor = new Color(0xffffff)
const visibleXruiQuery = defineQuery([XRUIComponent, VisibleComponent])
const visibleInteractableXRUIQuery = defineQuery([XRUIInteractableComponent, XRUIComponent, VisibleComponent])
const xruiQuery = defineQuery([XRUIComponent])

// todo - hoist to hyperflux state
const maxXruiPointerDistanceSqr = 3 * 3

// redirect DOM events from the canvas, to the 3D scene,
// to the appropriate child Web3DLayer, and finally (back) to the
// DOM to dispatch an event on the intended DOM target
const redirectDOMEvent = (evt) => {
  for (const entity of visibleXruiQuery()) {
    const layer = getComponent(entity, XRUIComponent)
    layer.updateWorldMatrix(true, true)
    const hit = layer.hitTest(Engine.instance.pointerScreenRaycaster.ray)
    if (hit && hit.intersection.object.visible) {
      hit.target.dispatchEvent(new evt.constructor(evt.type, evt))
      hit.target.focus()
      return
    }
  }
}

const updateControllerRayInteraction = (controller: PointerObject, xruiEntities: Entity[]) => {
  const cursor = controller.cursor
  let hit = null! as ReturnType<typeof WebContainer3D.prototype.hitTest>

  for (const entity of xruiEntities) {
    const layer = getComponent(entity, XRUIComponent)

    /**
     * get closest hit from all XRUIs
     */
    const layerHit = layer.hitTest(controller)
    if (layerHit && (!hit || layerHit.intersection.distance < hit.intersection.distance)) hit = layerHit
  }

  if (hit) {
    const interactable = window.getComputedStyle(hit.target).cursor == 'pointer'

    if (cursor) {
      cursor.visible = true
      cursor.position.copy(hit.intersection.point)
      controller.worldToLocal(cursor.position)

      if (interactable) {
        cursor.material.color = hitColor
      } else {
        cursor.material.color = normalColor
      }
    }

    controller.lastHit = hit
  } else {
    if (cursor) {
      cursor.material.color = normalColor
      cursor.visible = false
    }
  }
}

const updateClickEventsForController = (controller: PointerObject) => {
  if (controller.cursor?.visible) {
    const hit = controller.lastHit
    if (hit && hit.intersection.object.visible) {
      hit.target.dispatchEvent(new PointerEvent('click', { bubbles: true }))
      hit.target.focus()
    }
  }
}

const pointers = new Map<XRInputSource, PointerObject>()

const execute = () => {
  const xruiState = getState(XRUIState)
  const keys = Engine.instance.buttons

  const xrFrame = Engine.instance.xrFrame

  /** Update the objects to use for intersection tests */
  if (xrFrame && xruiState.interactionRays[0] === Engine.instance.pointerScreenRaycaster.ray)
    xruiState.interactionRays = (Array.from(pointers.values()) as (Ray | Object3D)[]).concat(
      Engine.instance.pointerScreenRaycaster.ray
    ) // todo, replace pointerScreenRaycaster with input sources

  if (!xrFrame && xruiState.interactionRays[0] !== Engine.instance.pointerScreenRaycaster.ray)
    xruiState.interactionRays = [Engine.instance.pointerScreenRaycaster.ray]

  const interactableXRUIEntities = visibleInteractableXRUIQuery()

  /** @todo rather than just a distance query, we should set this when the pointer is actually over an XRUI */
  let isCloseToVisibleXRUI = false

  for (const entity of interactableXRUIEntities) {
    if (
      hasComponent(entity, DistanceFromCameraComponent) &&
      DistanceFromCameraComponent.squaredDistance[entity] < maxXruiPointerDistanceSqr
    )
      isCloseToVisibleXRUI = true
  }

  if (xruiState.pointerActive !== isCloseToVisibleXRUI)
    getMutableState(XRUIState).pointerActive.set(isCloseToVisibleXRUI)

  /** do intersection tests */
  for (const inputSource of Engine.instance.inputSources) {
    if (inputSource.targetRayMode !== 'tracked-pointer') continue
    if (!pointers.has(inputSource)) {
      const pointer = createPointer(inputSource)
      const cursor = createUICursor()
      pointer.cursor = cursor
      pointer.add(cursor)
      cursor.visible = false
      pointers.set(inputSource, pointer)
      Engine.instance.scene.add(pointer)
    }

    const pointer = pointers.get(inputSource)!

    const referenceSpace = ReferenceSpace.origin
    if (Engine.instance.xrFrame && referenceSpace) {
      const pose = Engine.instance.xrFrame.getPose(inputSource.targetRaySpace, referenceSpace)
      if (pose) {
        pointer.position.copy(pose.transform.position as any as Vector3)
        pointer.quaternion.copy(pose.transform.orientation as any as Quaternion)
        pointer.updateMatrixWorld()
      }
    }

    pointer.material.visible = isCloseToVisibleXRUI

    if (
      (inputSource.handedness === 'left' && keys.LeftTrigger?.down) ||
      (inputSource.handedness === 'right' && keys.RightTrigger?.down)
    )
      updateClickEventsForController(pointer)

    if (inputSource.targetRayMode === 'tracked-pointer')
      updateControllerRayInteraction(pointer, interactableXRUIEntities)
  }

  const inputSources = Array.from(Engine.instance.inputSources.values())
  for (const [pointerSource, pointer] of pointers) {
    if (!inputSources.includes(pointerSource)) {
      Engine.instance.scene.remove(pointer)
      pointers.delete(pointerSource)
    }
  }

  /** only update visible XRUI */

  for (const entity of visibleXruiQuery()) {
    const xrui = getComponent(entity, XRUIComponent)
    xrui.update()
  }

  /** @todo remove this once XRUI no longer forces it internally */
  for (const entity of xruiQuery()) {
    const xrui = getComponent(entity, XRUIComponent)
    const visible = hasComponent(entity, VisibleComponent)
    xrui.matrixWorldAutoUpdate = visible
    xrui.matrixAutoUpdate = visible
  }

  // xrui.layoutSystem.viewFrustum.setFromPerspectiveProjectionMatrix(Engine.instance.camera.projectionMatrix)
  // EngineRenderer.instance.renderer.getSize(xrui.layoutSystem.viewResolution)
  // xrui.layoutSystem.update(world.delta, world.elapsedTime)
}

const reactor = () => {
  useEffect(() => {
    // @ts-ignore
    // console.log(JSON.stringify(xrui.WebLayerModule.WebLayerManager.instance.textureLoader.workerConfig))
    // xrui.WebLayerModule.WebLayerManager.instance.textureLoader.workerConfig = {
    //   astcSupported: false,
    //   etc1Supported: renderer.extensions.has( 'WEBGL_compressed_texture_etc1' ),
    //   etc2Supported: renderer.extensions.has( 'WEBGL_compressed_texture_etc' ),
    //   dxtSupported: renderer.extensions.has( 'WEBGL_compressed_texture_s3tc' ),
    //   bptcSupported: renderer.extensions.has( 'EXT_texture_compression_bptc' ),
    //   pvrtcSupported: false
    // }

    // const canvas = EngineRenderer.instance.renderer.getContext().canvas
    document.body.addEventListener('click', redirectDOMEvent)
    document.body.addEventListener('contextmenu', redirectDOMEvent)
    document.body.addEventListener('dblclick', redirectDOMEvent)

    getMutableState(XRUIState).interactionRays.set([Engine.instance.pointerScreenRaycaster.ray])

    return () => {
      document.body.removeEventListener('click', redirectDOMEvent)
      document.body.removeEventListener('contextmenu', redirectDOMEvent)
      document.body.removeEventListener('dblclick', redirectDOMEvent)
    }
  }, [])
  return null
}

export const XRUISystem = defineSystem({
  uuid: 'ee.engine.XRUISystem',
  execute,
  reactor
})
