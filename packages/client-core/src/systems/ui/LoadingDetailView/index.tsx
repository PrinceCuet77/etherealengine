import { createState, useHookstate } from '@hookstate/core'
import getImagePalette from 'image-palette-core'
import React, { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Color } from 'three'

import { EngineState } from '@etherealengine/engine/src/ecs/classes/EngineState'
import { SceneState } from '@etherealengine/engine/src/ecs/classes/Scene'
import { createTransitionState } from '@etherealengine/engine/src/xrui/functions/createTransitionState'
import { createXRUI } from '@etherealengine/engine/src/xrui/functions/createXRUI'
import { useXRUIState } from '@etherealengine/engine/src/xrui/functions/useXRUIState'
import { getMutableState } from '@etherealengine/hyperflux'

import ProgressBar from './SimpleProgressBar'
import LoadingDetailViewStyle from './style'

interface LoadingUIState {
  imageWidth: number
  imageHeight: number
}

export function createLoaderDetailView(transition: ReturnType<typeof createTransitionState>) {
  const xrui = createXRUI(function Loading() {
    return <LoadingDetailView transition={transition} />
  }, createState({ imageWidth: 1, imageHeight: 1 }))
  return xrui
}

const col = new Color()

function setDefaultPalette(colors) {
  colors.main.set('black')
  colors.background.set('white')
  colors.alternate.set('black')
}

const LoadingDetailView = (props: { transition: ReturnType<typeof createTransitionState> }) => {
  const uiState = useXRUIState<LoadingUIState>()
  const sceneData = useHookstate(getMutableState(SceneState).sceneData)
  const engineState = useHookstate(getMutableState(EngineState))
  const { t } = useTranslation()
  const colors = useHookstate({
    main: '',
    background: '',
    alternate: ''
  })

  useEffect(() => {
    const thumbnailUrl = sceneData.ornull?.thumbnailUrl.value
    const img = new Image()

    if (thumbnailUrl) {
      colors.main.set('')
      colors.background.set('')
      colors.alternate.set('')
      img.crossOrigin = 'anonymous'
      img.onload = function () {
        uiState.imageWidth.set(img.naturalWidth)
        uiState.imageHeight.set(img.naturalHeight)
        const palette = getImagePalette(img)
        if (palette) {
          colors.main.set(palette.color)
          colors.background.set(palette.backgroundColor)
          col.set(colors.background.value)
          colors.alternate.set(palette.alternativeColor)
        } else {
          setDefaultPalette(colors)
        }
      }
      img.src = thumbnailUrl
    } else {
      setDefaultPalette(colors)
    }

    return () => {
      img.onload = null
    }
  }, [sceneData.ornull?.thumbnailUrl])

  const sceneLoaded = engineState.sceneLoaded.value
  const joinedWorld = engineState.joinedWorld.value
  const loadingDetails = !sceneLoaded
    ? t('common:loader.loadingObjects')
    : !joinedWorld
    ? t('common:loader.joiningWorld')
    : t('common:loader.loadingComplete')

  return (
    <>
      <LoadingDetailViewStyle col={col} colors={colors} />
      <div id="loading-container" xr-layer="true">
        {/* <div id="thumbnail">
          <img xr-layer="true" xr-pixel-ratio="1" src={thumbnailUrl} crossOrigin="anonymous" />
        </div> */}
        <div id="loading-ui" xr-layer="true">
          <div id="loading-text" xr-layer="true" xr-pixel-ratio="3">
            {t('common:loader.loading')}
          </div>
          <div id="progress-text" xr-layer="true" xr-pixel-ratio="3">
            {engineState.loadingProgress.value}%
          </div>
          <div id="progress-container" xr-layer="true">
            <ProgressBar
              bgColor={colors.alternate.value}
              completed={engineState.loadingProgress.value}
              height="1px"
              baseBgColor="#000000"
              isLabelVisible={false}
            />
          </div>
          <div id="loading-details" xr-layer="true" xr-pixel-ratio="3">
            {loadingDetails}
          </div>
        </div>
      </div>
    </>
  )
}
