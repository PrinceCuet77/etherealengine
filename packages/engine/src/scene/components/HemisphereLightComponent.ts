import { useEffect } from 'react'
import { Color, HemisphereLight } from 'three'

import { matches } from '../../common/functions/MatchesUtils'
import { defineComponent, hasComponent, useComponent } from '../../ecs/functions/ComponentFunctions'
import { addObjectToGroup, removeObjectFromGroup } from './GroupComponent'

export const HemisphereLightComponent = defineComponent({
  name: 'HemisphereLightComponent',
  jsonID: 'hemisphere-light',

  onInit: (entity) => {
    const light = new HemisphereLight()
    addObjectToGroup(entity, light)
    return {
      light,
      skyColor: new Color(),
      groundColor: new Color(),
      intensity: 1
    }
  },

  onSet: (entity, component, json) => {
    if (!json) return
    if (matches.object.test(json.skyColor) && json.skyColor.isColor) component.skyColor.set(json.skyColor)
    if (matches.string.test(json.skyColor)) component.skyColor.value.set(json.skyColor)
    if (matches.object.test(json.groundColor) && json.groundColor.isColor) component.groundColor.set(json.groundColor)
    if (matches.string.test(json.groundColor)) component.groundColor.value.set(json.groundColor)
    if (matches.number.test(json.intensity)) component.intensity.set(json.intensity)
  },

  toJSON: (entity, component) => {
    return {
      skyColor: component.skyColor.value,
      groundColor: component.groundColor.value,
      intensity: component.intensity.value
    }
  },

  onRemove: (entity, component) => {
    removeObjectFromGroup(entity, component.light.value)
  },

  reactor: function ({ root }) {
    const light = useComponent(root.entity, HemisphereLightComponent)

    useEffect(() => {
      light.light.value.groundColor.set(light.groundColor.value)
    }, [light.groundColor])

    useEffect(() => {
      light.light.value.color.set(light.skyColor.value)
    }, [light.skyColor])

    useEffect(() => {
      light.light.value.intensity = light.intensity.value
    }, [light.intensity])

    return null
  }
})
