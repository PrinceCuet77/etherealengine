import { useEffect } from 'react'
import { Color, CubeTexture, sRGBEncoding } from 'three'

import { getMutableState, getState, useHookstate } from '@etherealengine/hyperflux'

import { AssetLoader } from '../../assets/classes/AssetLoader'
import { isClient } from '../../common/functions/getEnvironment'
import { SceneState } from '../../ecs/classes/Scene'
import { defineComponent, useComponent } from '../../ecs/functions/ComponentFunctions'
import { RendererState } from '../../renderer/RendererState'
import { EngineRenderer } from '../../renderer/WebGLRendererSystem'
import { Sky } from '../classes/Sky'
import { SkyTypeEnum } from '../constants/SkyTypeEnum'
import { getPmremGenerator, loadCubeMapTexture } from '../constants/Util'
import { addError, removeError } from '../functions/ErrorFunctions'

export const SkyboxComponent = defineComponent({
  name: 'SkyboxComponent',
  jsonID: 'skybox',
  onInit: (entity) => {
    return {
      backgroundColor: new Color(0x000000),
      equirectangularPath: '',
      cubemapPath: '/hdr/cubemap/skyboxsun25deg/',
      backgroundType: 1,
      sky: null! as Sky | null,
      skyboxProps: {
        turbidity: 10,
        rayleigh: 1,
        luminance: 1,
        mieCoefficient: 0.004999999999999893,
        mieDirectionalG: 0.99,
        inclination: 0.10471975511965978,
        azimuth: 0.16666666666666666
      }
    }
  },
  onSet: (entity, component, json) => {
    if (typeof json?.backgroundColor === 'number') component.backgroundColor.set(new Color(json.backgroundColor))
    if (typeof json?.equirectangularPath === 'string') component.equirectangularPath.set(json.equirectangularPath)
    if (typeof json?.cubemapPath === 'string') component.cubemapPath.set(json.cubemapPath)
    if (typeof json?.backgroundType === 'number') component.backgroundType.set(json.backgroundType)
    if (typeof json?.skyboxProps === 'object') component.skyboxProps.set(json.skyboxProps)
  },
  toJSON: (entity, component) => {
    return {
      backgroundColor: component.backgroundColor.value,
      equirectangularPath: component.equirectangularPath.value,
      cubemapPath: component.cubemapPath.value,
      backgroundType: component.backgroundType.value,
      skyboxProps: component.skyboxProps.get({ noproxy: true }) as any
    }
  },

  reactor: function ({ root }) {
    const entity = root.entity
    if (!isClient) return null

    const skyboxState = useComponent(entity, SkyboxComponent)
    const background = useHookstate(getMutableState(SceneState).background)

    useEffect(() => {
      if (skyboxState.backgroundType.value !== SkyTypeEnum.color) return
      background.set(skyboxState.backgroundColor.value)
    }, [skyboxState.backgroundType, skyboxState.backgroundColor])

    useEffect(() => {
      if (skyboxState.backgroundType.value !== SkyTypeEnum.cubemap) return
      const onLoad = (texture: CubeTexture) => {
        texture.encoding = sRGBEncoding
        background.set(getPmremGenerator().fromCubemap(texture).texture)
        removeError(entity, SkyboxComponent, 'FILE_ERROR')
      }
      const loadArgs: [
        string,
        (texture: CubeTexture) => void,
        ((event: ProgressEvent<EventTarget>) => void) | undefined,
        ((event: ErrorEvent) => void) | undefined
      ] = [
        skyboxState.cubemapPath.value,
        onLoad,
        undefined,
        (error) => addError(entity, SkyboxComponent, 'FILE_ERROR', error.message)
      ]
      loadCubeMapTexture(...loadArgs)
    }, [skyboxState.backgroundType, skyboxState.cubemapPath])

    useEffect(() => {
      if (skyboxState.backgroundType.value !== SkyTypeEnum.equirectangular) return
      AssetLoader.load(
        skyboxState.equirectangularPath.value,
        {},
        (texture) => {
          texture.encoding = sRGBEncoding
          background.set(getPmremGenerator().fromEquirectangular(texture).texture)
          removeError(entity, SkyboxComponent, 'FILE_ERROR')
        },
        undefined,
        (error) => {
          addError(entity, SkyboxComponent, 'FILE_ERROR', error.message)
        }
      )
    }, [skyboxState.backgroundType, skyboxState.equirectangularPath])

    useEffect(() => {
      if (skyboxState.backgroundType.value !== SkyTypeEnum.skybox) {
        if (skyboxState.sky.value) skyboxState.sky.set(null)
        return
      }

      if (skyboxState.backgroundType.value === SkyTypeEnum.skybox && !skyboxState.sky.value) {
        skyboxState.sky.set(new Sky())
      }

      const sky = skyboxState.sky.value!

      sky.azimuth = skyboxState.skyboxProps.value.azimuth
      sky.inclination = skyboxState.skyboxProps.value.inclination

      sky.mieCoefficient = skyboxState.skyboxProps.value.mieCoefficient
      sky.mieDirectionalG = skyboxState.skyboxProps.value.mieDirectionalG
      sky.rayleigh = skyboxState.skyboxProps.value.rayleigh
      sky.turbidity = skyboxState.skyboxProps.value.turbidity
      sky.luminance = skyboxState.skyboxProps.value.luminance

      getState(RendererState).csm?.lightDirection.copy(sky.sunPosition).multiplyScalar(-1)
      background.set(
        getPmremGenerator().fromCubemap(sky.generateSkyboxTextureCube(EngineRenderer.instance.renderer)).texture
      )
    }, [skyboxState.backgroundType, skyboxState.skyboxProps])

    return null
  },

  errors: ['FILE_ERROR']
})
