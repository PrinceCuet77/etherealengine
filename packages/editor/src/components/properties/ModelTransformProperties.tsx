import React, { useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'
import { DoubleSide, Mesh, MeshStandardMaterial } from 'three'

import { API } from '@etherealengine/client-core/src/API'
import { FileBrowserService } from '@etherealengine/client-core/src/common/services/FileBrowserService'
import {
  ImageTransformParameters,
  ModelTransformParameters
} from '@etherealengine/engine/src/assets/classes/ModelTransform'
import { Entity } from '@etherealengine/engine/src/ecs/classes/Entity'
import {
  ComponentType,
  getMutableComponent,
  hasComponent
} from '@etherealengine/engine/src/ecs/functions/ComponentFunctions'
import { MaterialSource, SourceType } from '@etherealengine/engine/src/renderer/materials/components/MaterialSource'
import MeshBasicMaterial from '@etherealengine/engine/src/renderer/materials/constants/material-prototypes/MeshBasicMaterial.mat'
import bakeToVertices from '@etherealengine/engine/src/renderer/materials/functions/bakeToVertices'
import { materialsFromSource } from '@etherealengine/engine/src/renderer/materials/functions/MaterialLibraryFunctions'
import { ModelComponent } from '@etherealengine/engine/src/scene/components/ModelComponent'
import { getModelResources } from '@etherealengine/engine/src/scene/functions/loaders/ModelFunctions'
import { useHookstate } from '@etherealengine/hyperflux'
import { NO_PROXY, State } from '@etherealengine/hyperflux/functions/StateFunctions'

import { ToggleButton } from '@mui/material'

import exportGLTF from '../../functions/exportGLTF'
import { accessSelectionState } from '../../services/SelectionServices'
import BooleanInput from '../inputs/BooleanInput'
import { Button } from '../inputs/Button'
import InputGroup from '../inputs/InputGroup'
import NumericInput from '../inputs/NumericInput'
import NumericInputGroup from '../inputs/NumericInputGroup'
import ParameterInput from '../inputs/ParameterInput'
import SelectInput from '../inputs/SelectInput'
import StringInput from '../inputs/StringInput'
import TexturePreviewInput from '../inputs/TexturePreviewInput'
import CollapsibleBlock from '../layout/CollapsibleBlock'
import PaginatedList from '../layout/PaginatedList'
import LightmapBakerProperties from './LightmapBakerProperties'

const TransformContainer = (styled as any).div`
  color: var(--textColor);
  text-align: -webkit-center;
  margin-top: 2em;
  margin-bottom: 4em;
  background-color: var(--background2);
  overflow: scroll;
`

const ElementsContainer = (styled as any).div`
  margin: 16px;
  padding: 8px;
  color: var(--textColor);
`

const FilterToggle = styled(ToggleButton)`
  color: var(--textColor);
`

const OptimizeButton = styled(Button)`
  @keyframes glowing {
    0% {
      background-color: #f00;
      box-shadow: 0 0 5px #f00;
    }
    16% {
      background-color: #ff0;
      box-shadow: 0 0 20px #ff0;
    }
    33% {
      background-color: #0f0;
      box-shadow: 0 0 5px #0f0;
    }
    50% {
      background-color: #0ff;
      box-shadow: 0 0 20px #0ff;
    }
    66% {
      background-color: #00f;
      box-shadow: 0 0 5px #00f;
    }
    83% {
      background-color: #f0f;
      box-shadow: 0 0 20px #f0f;
    }
    100% {
      background-color: #f00;
      box-shadow: 0 0 5px #f00;
    }
  }
  animation: glowing 5000ms infinite;

  &:hover {
    animation: glowing 250ms infinite;
  }
`

export default function ModelTransformProperties({
  modelState,
  onChangeModel
}: {
  modelState: State<ComponentType<typeof ModelComponent>>
  onChangeModel: any
}) {
  const { t } = useTranslation()
  const selectionState = accessSelectionState()
  const transforming = useHookstate<boolean>(false)
  const transformHistory = useHookstate<string[]>([])

  const transformParms = useHookstate<ModelTransformParameters>({
    modelFormat: 'glb',
    dedup: true,
    prune: true,
    reorder: true,
    resample: true,
    weld: {
      enabled: true,
      tolerance: 0.001
    },
    dracoCompression: {
      enabled: true,
      options: {
        method: 'sequential',
        encodeSpeed: 0,
        decodeSpeed: 0,
        quantizePosition: 14,
        quantizeNormal: 8,
        quantizeColor: 8,
        quantizeTexcoord: 12,
        quantizeGeneric: 16,
        quantizationVolume: 'mesh'
      }
    },
    textureFormat: 'ktx2',
    textureCompressionType: 'etc1',
    flipY: true,
    textureCompressionQuality: 128,
    maxTextureSize: 1024,
    resources: {
      geometries: [],
      images: []
    }
  })

  const vertexBakeOptions = useHookstate({
    map: true,
    emissive: true,
    lightMap: true,
    matcapPath: ''
  })

  const doVertexBake = useCallback(
    (modelState: State<ComponentType<typeof ModelComponent>>) => async () => {
      const attribs = [
        ...(vertexBakeOptions.map.value ? [{ field: 'map', attribName: 'uv' }] : []),
        ...(vertexBakeOptions.emissive.value ? [{ field: 'emissiveMap', attribName: 'uv' }] : []),
        ...(vertexBakeOptions.lightMap.value ? [{ field: 'lightMap', attribName: 'uv2' }] : [])
      ] as { field: keyof MeshStandardMaterial; attribName: string }[]
      const colors: (keyof MeshStandardMaterial)[] = ['color']
      const src: MaterialSource = { type: SourceType.MODEL, path: modelState.src.value }
      await Promise.all(
        materialsFromSource(src)?.map((matComponent) =>
          bakeToVertices<MeshStandardMaterial>(
            matComponent.material as MeshStandardMaterial,
            colors,
            attribs,
            modelState.scene.value,
            MeshBasicMaterial.prototypeId
          )
        ) ?? []
      )
    },
    [vertexBakeOptions]
  )

  const attribToDelete = useHookstate('uv uv2')

  const deleteAttribute = useCallback(
    (modelState: State<ComponentType<typeof ModelComponent>>) => () => {
      const toDeletes = attribToDelete.value.split(/\s+/)
      modelState.scene.value?.traverse((mesh: Mesh) => {
        if (!mesh?.isMesh) return
        const geometry = mesh.geometry
        if (!geometry?.isBufferGeometry) return
        toDeletes.map((toDelete) => {
          if (geometry.hasAttribute(toDelete)) {
            geometry.deleteAttribute(toDelete)
          }
        })
      })
    },
    [attribToDelete]
  )

  const onChangeTransformParm = useCallback(
    (state: State<any>, k: keyof typeof state.value) => {
      return (val) => {
        state[k].set(val)
      }
    },
    [transformParms]
  )

  const onChangeResourceOverrideParm = useCallback(
    (state: State<any>, k: keyof typeof state.value) => {
      return (val) => {
        state[k].parameters.set(val)
      }
    },
    [transformParms.resources]
  )

  const onTransformModel = useCallback(
    (modelState: State<ComponentType<typeof ModelComponent>>) => async () => {
      transforming.set(true)
      const modelSrc = modelState.src.value
      const nuPath = await API.instance.client.service('model-transform').create({
        path: modelSrc,
        transformParameters: transformParms.value
      })
      transformHistory.set([modelSrc, ...transformHistory.value])
      const [_, directoryToRefresh, fileName] = /.*\/(projects\/.*)\/([\w\d\s\-_.]*)$/.exec(nuPath)!
      await FileBrowserService.fetchFiles(directoryToRefresh)
      onChangeModel(nuPath)
      transforming.set(false)
    },
    [transformParms]
  )

  const onUndoTransform = useCallback(async () => {
    const prev = transformHistory.value[0]
    onChangeModel(prev)
    transformHistory.set(transformHistory.value.slice(1))
  }, [transforming])

  const onBakeSelected = useCallback(async () => {
    const selectedModelEntities: Entity[] = selectionState.selectedEntities
      .get()
      .filter((entity) => typeof entity !== 'string' && hasComponent(entity, ModelComponent))
      .map((entity: Entity) => entity)
    for (const entity of selectedModelEntities) {
      console.log('at entity ' + entity)
      const modelComponent = getMutableComponent(entity, ModelComponent)
      console.log('processing model from src ' + modelComponent.src.value)
      //bake lightmaps to vertices
      console.log('baking vertices...')
      await doVertexBake(modelComponent)()
      console.log('baked vertices')
      //delete uv and uv2 attributes
      console.log('deleting attributes...')
      await deleteAttribute(modelComponent)()
      console.log('deleted attributes')
      //set materials to be double-sided
      modelComponent.scene.value?.traverse((mesh: Mesh) => {
        if (!mesh?.isMesh) return
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        materials.map((material) => (material.side = DoubleSide))
      })
      //save changes to model
      const bakedPath = modelComponent.src.value.replace(/\.glb$/, '-baked.glb')
      console.log('saving baked model to ' + bakedPath + '...')
      await exportGLTF(entity, bakedPath)
      console.log('saved baked model')
      //perform gltf transform
      console.log('transforming model at ' + bakedPath + '...')
      const transformedPath = await API.instance.client.service('model-transform').create({
        path: bakedPath,
        transformParameters: transformParms.value
      })
      console.log('transformed model into ' + transformedPath)
      onChangeModel(transformedPath)
    }
  }, [selectionState.selectedEntities])

  useEffect(() => {
    transformParms.resources.set(getModelResources(modelState.value))
  }, [modelState.scene])

  return (
    <CollapsibleBlock label="Model Transform Properties">
      <TransformContainer>
        <LightmapBakerProperties modelState={modelState} />
        <CollapsibleBlock label="glTF-Transform">
          <ElementsContainer>
            <InputGroup name="Model Format" label={t('editor:properties.model.transform.modelFormat')}>
              <SelectInput
                value={transformParms.modelFormat.value}
                onChange={onChangeTransformParm(transformParms, 'modelFormat')}
                options={[
                  { label: 'glB', value: 'glb' },
                  { label: 'glTF', value: 'gltf' }
                ]}
              />
            </InputGroup>
            <InputGroup name="Remove Duplicates" label={t('editor:properties.model.transform.removeDuplicates')}>
              <BooleanInput
                value={transformParms.dedup.value}
                onChange={onChangeTransformParm(transformParms, 'dedup')}
              />
            </InputGroup>
            <InputGroup name="Prune Unused" label={t('editor:properties.model.transform.pruneUnused')}>
              <BooleanInput
                value={transformParms.prune.value}
                onChange={onChangeTransformParm(transformParms, 'prune')}
              />
            </InputGroup>
            <InputGroup name="Reorder" label={t('editor:properties.model.transform.reorder')}>
              <BooleanInput
                value={transformParms.reorder.value}
                onChange={onChangeTransformParm(transformParms, 'reorder')}
              />
            </InputGroup>
            <InputGroup name="Weld Vertices" label={t('editor:properties.model.transform.weldVertices')}>
              <BooleanInput
                value={transformParms.weld.enabled.value}
                onChange={onChangeTransformParm(transformParms.weld, 'enabled')}
              />
            </InputGroup>
            {transformParms.weld.enabled.value && (
              <>
                <NumericInputGroup
                  name="Weld Threshold"
                  label={t('editor:properties.model.transform.weldThreshold')}
                  value={transformParms.weld.tolerance.value}
                  onChange={onChangeTransformParm(transformParms.weld, 'tolerance')}
                  min={0}
                  max={1}
                />
              </>
            )}
            <InputGroup name="Resample Animations" label={t('editor:properties.model.transform.resampleAnimations')}>
              <BooleanInput
                value={transformParms.resample.value}
                onChange={onChangeTransformParm(transformParms, 'resample')}
              />
            </InputGroup>
            <InputGroup name="Use DRACO Compression" label={t('editor:properties.model.transform.useDraco')}>
              <BooleanInput
                value={transformParms.dracoCompression.enabled.value}
                onChange={onChangeTransformParm(transformParms.dracoCompression, 'enabled')}
              />
            </InputGroup>
            {transformParms.dracoCompression.enabled.value && (
              <>
                <ParameterInput
                  entity={`${modelState.src.value}-draco-compression`}
                  values={transformParms.dracoCompression.options.value}
                  onChange={onChangeTransformParm.bind({}, transformParms.dracoCompression.options)}
                />
              </>
            )}
            <InputGroup name="Texture Format" label={t('editor:properties.model.transform.textureFormat')}>
              <SelectInput
                value={transformParms.textureFormat.value}
                onChange={onChangeTransformParm(transformParms, 'textureFormat')}
                options={[
                  { label: 'Default', value: 'default' },
                  { label: 'JPG', value: 'jpg' },
                  { label: 'KTX2', value: 'ktx2' },
                  { label: 'PNG', value: 'png' },
                  { label: 'WebP', value: 'webp' }
                ]}
              />
            </InputGroup>
            <NumericInputGroup
              name="Max Texture Size"
              label={t('editor:properties.model.transform.maxTextureSize')}
              value={transformParms.maxTextureSize.value}
              onChange={onChangeTransformParm(transformParms, 'maxTextureSize')}
              max={4096}
              min={64}
            />
            {transformParms.textureFormat.value === 'ktx2' && (
              <>
                <InputGroup
                  name="Texture Compression Type"
                  label={t('editor:properties.model.transform.textureCompressionType')}
                >
                  <SelectInput
                    value={transformParms.textureCompressionType.value}
                    onChange={onChangeTransformParm(transformParms, 'textureCompressionType')}
                    options={[
                      { label: 'UASTC', value: 'uastc' },
                      { label: 'ETC1', value: 'etc1' }
                    ]}
                  />
                </InputGroup>
                <NumericInputGroup
                  name="KTX2 Quality"
                  label={t('editor:properties.model.transform.ktx2Quality')}
                  value={transformParms.textureCompressionQuality.value}
                  onChange={onChangeTransformParm(transformParms, 'textureCompressionQuality')}
                  max={255}
                  min={1}
                  smallStep={1}
                  mediumStep={1}
                  largeStep={2}
                />
              </>
            )}
            <CollapsibleBlock label="Resource Overrides">
              <PaginatedList
                list={transformParms.resources.images}
                element={(image: State<ImageTransformParameters>) => {
                  return (
                    <>
                      <div style={{ width: '100%' }}>
                        <InputGroup name="Resource" label={image.resourceId.value}>
                          <BooleanInput
                            value={image.enabled.value}
                            onChange={onChangeTransformParm(image, 'enabled')}
                          />
                        </InputGroup>
                      </div>
                      {image.enabled.value && (
                        <div style={{ width: '100%' }}>
                          <BooleanInput
                            value={image.parameters.textureFormat.enabled.value}
                            onChange={onChangeTransformParm(image.parameters.textureFormat, 'enabled')}
                          />
                          <InputGroup
                            name="Texture Format"
                            label={t('editor:properties.model.transform.textureFormat')}
                          >
                            {image.parameters.textureFormat.enabled.value && (
                              <SelectInput
                                value={image.parameters.textureFormat.parameters.value}
                                onChange={onChangeResourceOverrideParm(image.parameters, 'textureFormat')}
                                options={[
                                  { label: 'Default', value: 'default' },
                                  { label: 'JPG', value: 'jpg' },
                                  { label: 'KTX2', value: 'ktx2' },
                                  { label: 'PNG', value: 'png' },
                                  { label: 'WebP', value: 'webp' }
                                ]}
                              />
                            )}
                          </InputGroup>
                          <BooleanInput
                            value={image.parameters.maxTextureSize.enabled.value}
                            onChange={onChangeTransformParm(image.parameters.maxTextureSize, 'enabled')}
                          />
                          <InputGroup
                            name="Max Texture Size"
                            label={t('editor:properties.model.transform.maxTextureSize')}
                          >
                            {image.parameters.maxTextureSize.enabled.value && (
                              <NumericInput
                                value={image.parameters.maxTextureSize.parameters.value}
                                onChange={onChangeResourceOverrideParm(image.parameters, 'maxTextureSize')}
                                max={4096}
                                min={64}
                              />
                            )}
                          </InputGroup>
                          <BooleanInput
                            value={image.parameters.textureCompressionType.enabled.value}
                            onChange={onChangeTransformParm(image.parameters.textureCompressionType, 'enabled')}
                          />
                          <InputGroup
                            name="Texture Compression Type"
                            label={t('editor:properties.model.transform.textureCompressionType')}
                          >
                            {image.parameters.textureCompressionType.enabled.value && (
                              <SelectInput
                                value={image.parameters.textureCompressionType.parameters.value}
                                onChange={onChangeResourceOverrideParm(image.parameters, 'textureCompressionType')}
                                options={[
                                  { label: 'UASTC', value: 'uastc' },
                                  { label: 'ETC1', value: 'etc1' }
                                ]}
                              />
                            )}
                          </InputGroup>
                          <BooleanInput
                            value={image.parameters.textureCompressionQuality.enabled.value}
                            onChange={onChangeTransformParm(image.parameters.textureCompressionQuality, 'enabled')}
                          />
                          <InputGroup name="KTX2 Quality" label={t('editor:properties.model.transform.ktx2Quality')}>
                            {image.parameters.textureCompressionQuality.enabled.value && (
                              <NumericInput
                                value={image.parameters.textureCompressionQuality.parameters.value}
                                onChange={onChangeResourceOverrideParm(image.parameters, 'textureCompressionQuality')}
                                max={255}
                                min={1}
                                smallStep={1}
                                mediumStep={1}
                                largeStep={2}
                              />
                            )}
                          </InputGroup>
                          <BooleanInput
                            value={image.parameters.flipY.enabled.value}
                            onChange={onChangeTransformParm(image.parameters.flipY, 'enabled')}
                          />
                          <InputGroup name="Flip Y" label={t('editor:properties.model.transform.flipY')}>
                            {image.parameters.flipY.enabled.value && (
                              <BooleanInput
                                value={image.parameters.flipY.parameters.value}
                                onChange={onChangeResourceOverrideParm(image.parameters, 'flipY')}
                              />
                            )}
                          </InputGroup>
                        </div>
                      )}
                    </>
                  )
                }}
              />
            </CollapsibleBlock>
            {!transforming.value && <OptimizeButton onClick={onTransformModel(modelState)}>Optimize</OptimizeButton>}
            {transforming.value && <p>Transforming...</p>}
            {transformHistory.length > 0 && <Button onClick={onUndoTransform}>Undo</Button>}
          </ElementsContainer>
        </CollapsibleBlock>
        <CollapsibleBlock label="Delete Attribute">
          <InputGroup name="Attribute" label="Attribute">
            <StringInput value={attribToDelete.value} onChange={attribToDelete.set} />
          </InputGroup>
          <Button onClick={deleteAttribute(modelState)}>Delete Attribute</Button>
        </CollapsibleBlock>
        <CollapsibleBlock label="Bake To Vertices">
          <InputGroup name="map" label="map">
            <BooleanInput
              value={vertexBakeOptions.map.value}
              onChange={(val: boolean) => {
                vertexBakeOptions.map.set(val)
              }}
            />
          </InputGroup>
          <InputGroup name="lightMap" label="lightMap">
            <BooleanInput
              value={vertexBakeOptions.lightMap.value}
              onChange={(val: boolean) => {
                vertexBakeOptions.lightMap.set(val)
              }}
            />
          </InputGroup>
          <InputGroup name="emissive" label="emissive">
            <BooleanInput
              value={vertexBakeOptions.emissive.value}
              onChange={(val: boolean) => {
                vertexBakeOptions.emissive.set(val)
              }}
            />
          </InputGroup>
          <InputGroup name="matcap" label="matcap">
            <TexturePreviewInput
              value={vertexBakeOptions.matcapPath.value}
              onChange={(val: string) => {
                vertexBakeOptions.matcapPath.set(val)
              }}
            />
          </InputGroup>
          <Button onClick={doVertexBake(modelState)}>Bake To Vertices</Button>
          <Button onClick={onBakeSelected}>Bake And Optimize</Button>
        </CollapsibleBlock>
      </TransformContainer>
    </CollapsibleBlock>
  )
}
