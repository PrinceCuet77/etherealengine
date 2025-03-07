import { getState } from '@etherealengine/hyperflux'
import type { WebContainer3D } from '@etherealengine/xrui'

import { defineComponent } from '../../ecs/functions/ComponentFunctions'
import { XRUIState } from '../XRUIState'

export const XRUIComponent = defineComponent({
  name: 'XRUIComponent',

  onInit: (entity) => {
    return null! as WebContainer3D
  },

  onSet: (entity, component, json: WebContainer3D) => {
    if (typeof json !== 'undefined') {
      component.set(json)
      component.value.interactionRays = getState(XRUIState).interactionRays
    }
  },

  onRemove: (entity, component) => {
    component.value.destroy()
  }
})

/**
 * XRUIInteractableComponent
 *
 * a tag component that enables a visible XRUI to have the pointer/cursor interact with it
 */
export const XRUIInteractableComponent = defineComponent({ name: 'XRUIComponent' })
