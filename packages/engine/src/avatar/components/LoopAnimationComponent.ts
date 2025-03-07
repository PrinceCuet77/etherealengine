import { useEffect } from 'react'
import { AnimationAction, AnimationClip, AnimationMixer, Vector3 } from 'three'

import { isClient } from '../../common/functions/getEnvironment'
import {
  addComponent,
  ComponentType,
  defineComponent,
  getComponent,
  hasComponent,
  removeComponent,
  useComponent,
  useOptionalComponent
} from '../../ecs/functions/ComponentFunctions'
import { CallbackComponent, setCallback, StandardCallbacks } from '../../scene/components/CallbackComponent'
import { ModelComponent } from '../../scene/components/ModelComponent'
import { AnimationManager } from '../AnimationManager'
import { setupAvatarModel } from '../functions/avatarFunctions'
import { AnimationComponent } from './AnimationComponent'
import { AvatarAnimationComponent } from './AvatarAnimationComponent'

export const LoopAnimationComponent = defineComponent({
  name: 'LoopAnimationComponent',
  jsonID: 'loop-animation',

  onInit: (entity) => {
    return {
      activeClipIndex: -1,
      hasAvatarAnimations: false,
      action: null as AnimationAction | null
    }
  },

  onSet: (entity, component, json) => {
    if (!json) return

    if (typeof json.activeClipIndex === 'number') component.activeClipIndex.set(json.activeClipIndex)
    if (typeof json.hasAvatarAnimations === 'boolean') component.hasAvatarAnimations.set(json.hasAvatarAnimations)
  },

  toJSON: (entity, component) => {
    return {
      activeClipIndex: component.activeClipIndex.value,
      hasAvatarAnimations: component.hasAvatarAnimations.value
    }
  },

  reactor: function ({ root }) {
    if (!isClient) return null

    const entity = root.entity

    const modelComponent = useOptionalComponent(entity, ModelComponent)

    /**
     * Callback functions
     */
    useEffect(() => {
      if (hasComponent(entity, CallbackComponent)) return
      const play = () => {
        playAnimationClip(getComponent(entity, AnimationComponent), getComponent(entity, LoopAnimationComponent))
      }
      const pause = () => {
        const loopAnimationComponent = getComponent(entity, LoopAnimationComponent)
        if (loopAnimationComponent.action) loopAnimationComponent.action.paused = true
      }
      const stop = () => {
        const loopAnimationComponent = getComponent(entity, LoopAnimationComponent)
        if (loopAnimationComponent.action) loopAnimationComponent.action.stop()
      }
      setCallback(entity, StandardCallbacks.PLAY, play)
      setCallback(entity, StandardCallbacks.PAUSE, pause)
      setCallback(entity, StandardCallbacks.STOP, stop)
    }, [])

    /**
     * A model is required for LoopAnimationComponent.
     */
    useEffect(() => {
      if (!modelComponent?.scene?.value) return

      const scene = modelComponent.scene.value

      if (!hasComponent(entity, AnimationComponent)) {
        addComponent(entity, AnimationComponent, {
          mixer: new AnimationMixer(scene),
          animationSpeed: 1,
          animations: []
        })
      }

      const loopComponent = getComponent(entity, LoopAnimationComponent)
      const animationComponent = getComponent(entity, AnimationComponent)

      const changedToAvatarAnimation =
        loopComponent.hasAvatarAnimations && animationComponent.animations !== AnimationManager.instance._animations
      const changedToObjectAnimation =
        !loopComponent.hasAvatarAnimations && animationComponent.animations !== scene.animations

      if (changedToAvatarAnimation) {
        if (!hasComponent(entity, AvatarAnimationComponent)) {
          addComponent(entity, AvatarAnimationComponent, {
            animationGraph: {
              states: {},
              transitionRules: {},
              currentState: null!,
              stateChanged: null!
            },
            rootYRatio: 1,
            locomotion: new Vector3()
          })
          const setupLoopableAvatarModel = setupAvatarModel(entity)
          setupLoopableAvatarModel(scene)
        }
      }

      if (changedToObjectAnimation) {
        if (hasComponent(entity, AvatarAnimationComponent)) {
          removeComponent(entity, AvatarAnimationComponent)
        }
        animationComponent.mixer = new AnimationMixer(scene)
        animationComponent.animations = scene.animations
      }

      if (!loopComponent.action?.paused) playAnimationClip(animationComponent, loopComponent)
    }, [modelComponent?.scene])

    return null
  }
})

export const playAnimationClip = (
  animationComponent: ComponentType<typeof AnimationComponent>,
  loopAnimationComponent: ComponentType<typeof LoopAnimationComponent>
) => {
  if (loopAnimationComponent.action) loopAnimationComponent.action.stop()
  if (
    loopAnimationComponent.activeClipIndex >= 0 &&
    animationComponent.animations[loopAnimationComponent.activeClipIndex]
  ) {
    animationComponent.mixer.stopAllAction()
    loopAnimationComponent.action = animationComponent.mixer
      .clipAction(
        AnimationClip.findByName(
          animationComponent.animations,
          animationComponent.animations[loopAnimationComponent.activeClipIndex].name
        )
      )
      .play()
  }
}
