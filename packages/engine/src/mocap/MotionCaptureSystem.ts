import { POSE_LANDMARKS } from '@mediapipe/pose'
import { decode, encode } from 'msgpackr'
import { useEffect } from 'react'
import { Mesh, MeshBasicMaterial, SphereGeometry, Vector3 } from 'three'

import { EntityUUID } from '@etherealengine/common/src/interfaces/EntityUUID'
import { PeerID } from '@etherealengine/common/src/interfaces/PeerID'
import { dispatchAction, getState } from '@etherealengine/hyperflux'

import { AvatarRigComponent } from '../avatar/components/AvatarAnimationComponent'
import { RingBuffer } from '../common/classes/RingBuffer'
import { Engine } from '../ecs/classes/Engine'
import { getComponent } from '../ecs/functions/ComponentFunctions'
import { removeEntity } from '../ecs/functions/EntityFunctions'
import { defineSystem } from '../ecs/functions/SystemFunctions'
import { DataChannelType, Network } from '../networking/classes/Network'
import { addDataChannelHandler, removeDataChannelHandler } from '../networking/NetworkState'
import { UUIDComponent } from '../scene/components/UUIDComponent'
import { TransformComponent } from '../transform/components/TransformComponent'
import { XRAction, XRState } from '../xr/XRState'

export const motionCaptureHeadSuffix = '_motion_capture_head'
export const motionCaptureLeftHandSuffix = '_motion_capture_left_hand'
export const motionCaptureRightHandSuffix = '_motion_capture_right_hand'

export interface NormalizedLandmark {
  x: number
  y: number
  z: number
  visibility?: number
}

export const sendResults = (landmarks: NormalizedLandmark[]) => {
  return encode({
    timestamp: Date.now(),
    peerIndex: Engine.instance.worldNetwork.peerIDToPeerIndex.get(Engine.instance.worldNetwork.peerID)!,
    landmarks
  })
}

export const receiveResults = (results: ArrayBuffer) => {
  const { timestamp, peerIndex, landmarks } = decode(new Uint8Array(results)) as {
    timestamp: number
    peerIndex: number
    landmarks: NormalizedLandmark[]
  }
  const peerID = Engine.instance.worldNetwork.peerIndexToPeerID.get(peerIndex)
  return { timestamp, peerID, landmarks }
}

export const MotionCaptureFunctions = {
  sendResults,
  receiveResults
}

export const mocapDataChannelType = 'ee.core.mocap.dataChannel' as DataChannelType

const handleMocapData = (
  network: Network,
  dataChannel: DataChannelType,
  fromPeerID: PeerID,
  message: ArrayBufferLike
) => {
  if (network.isHosting) {
    network.transport.bufferToAll(mocapDataChannelType, message)
  }
  const { peerID, landmarks } = MotionCaptureFunctions.receiveResults(message as ArrayBuffer)
  if (!peerID) return
  if (!timeSeriesMocapData.has(peerID)) {
    timeSeriesMocapData.set(peerID, new RingBuffer(100))
  }
  timeSeriesMocapData.get(peerID)!.add(landmarks)
}

const timeSeriesMocapData = new Map<PeerID, RingBuffer<NormalizedLandmark[]>>()

const objs = [] as Mesh[]
const debug = false

if (debug)
  for (let i = 0; i < 33; i++) {
    objs.push(new Mesh(new SphereGeometry(0.05), new MeshBasicMaterial()))
    Engine.instance.scene.add(objs[i])
  }

const hipsPos = new Vector3()
const headPos = new Vector3()
const leftHandPos = new Vector3()
const rightHandPos = new Vector3()

const execute = () => {
  const xrState = getState(XRState)

  if (xrState.sessionActive) return

  const network = Engine.instance.worldNetwork
  if (!network) return

  const localClientEntity = Engine.instance.localClientEntity

  for (const [peerID, mocapData] of timeSeriesMocapData) {
    if (!network.peers.has(peerID)) {
      timeSeriesMocapData.delete(peerID)
      continue
    }
    const userID = network.peers.get(peerID)!.userId
    const entity = Engine.instance.getUserAvatarEntity(userID)
    if (!entity) continue

    if (entity === localClientEntity) {
      const data = mocapData.getLast()
      if (!data) continue

      const leftHips = data[POSE_LANDMARKS.LEFT_HIP]
      const rightHips = data[POSE_LANDMARKS.RIGHT_HIP]
      const nose = data[POSE_LANDMARKS.NOSE]
      const leftEar = data[POSE_LANDMARKS.LEFT_EAR]
      const rightEar = data[POSE_LANDMARKS.RIGHT_EAR]
      const leftShoulder = data[POSE_LANDMARKS.LEFT_SHOULDER]
      const rightShoulder = data[POSE_LANDMARKS.RIGHT_SHOULDER]
      const leftElbow = data[POSE_LANDMARKS.LEFT_ELBOW]
      const rightElbow = data[POSE_LANDMARKS.RIGHT_ELBOW]
      const rightWrist = data[POSE_LANDMARKS.LEFT_WRIST]
      const leftWrist = data[POSE_LANDMARKS.RIGHT_WRIST]

      const head = !!nose.visibility && nose.visibility > 0.5
      const leftHand = !!leftWrist.visibility && leftWrist.visibility > 0.5
      const rightHand = !!rightWrist.visibility && rightWrist.visibility > 0.5

      const headUUID = (Engine.instance.userId + motionCaptureHeadSuffix) as EntityUUID
      const leftHandUUID = (Engine.instance.userId + motionCaptureLeftHandSuffix) as EntityUUID
      const rightHandUUID = (Engine.instance.userId + motionCaptureRightHandSuffix) as EntityUUID

      const ikTargetHead = UUIDComponent.entitiesByUUID[headUUID]
      const ikTargetLeftHand = UUIDComponent.entitiesByUUID[leftHandUUID]
      const ikTargetRightHand = UUIDComponent.entitiesByUUID[rightHandUUID]

      if (!head && ikTargetHead) removeEntity(ikTargetHead)
      if (!leftHand && ikTargetLeftHand) removeEntity(ikTargetLeftHand)
      if (!rightHand && ikTargetRightHand) removeEntity(ikTargetRightHand)

      if (head && !ikTargetHead) dispatchAction(XRAction.spawnIKTarget({ handedness: 'none', uuid: headUUID }))
      if (leftHand && !ikTargetLeftHand)
        dispatchAction(XRAction.spawnIKTarget({ handedness: 'left', uuid: leftHandUUID }))
      if (rightHand && !ikTargetRightHand)
        dispatchAction(XRAction.spawnIKTarget({ handedness: 'right', uuid: rightHandUUID }))

      const avatarRig = getComponent(entity, AvatarRigComponent)
      const avatarTransform = getComponent(entity, TransformComponent)
      if (!avatarRig) continue

      const avatarHips = avatarRig.rig.Hips
      avatarHips.getWorldPosition(hipsPos)

      if (debug)
        for (let i = 0; i < 33; i++) {
          objs[i].position
            .set(data[i].x, data[i].y, data[i].z)
            .multiplyScalar(-1)
            .applyQuaternion(avatarTransform.rotation)
            .add(hipsPos)
          objs[i].visible = !!data[i].visibility && data[i].visibility! > 0.5
          objs[i].updateMatrixWorld(true)
        }

      if (ikTargetHead) {
        if (!nose.visibility || nose.visibility < 0.5) continue
        if (!nose.x || !nose.y || !nose.z) continue
        const ik = getComponent(ikTargetHead, TransformComponent)
        headPos
          .set((leftEar.x + rightEar.x) / 2, (leftEar.y + rightEar.y) / 2, (leftEar.z + rightEar.z) / 2)
          .multiplyScalar(-1)
          .applyQuaternion(avatarTransform.rotation)
          .add(hipsPos)
        ik.position.copy(headPos)
        // ik.rotation.setFromUnitVectors(
        //   new Vector3(0, 1, 0),
        //   new Vector3(nose.x, -nose.y, nose.z).sub(headPos).normalize()
        // ).multiply(avatarTransform.rotation)
      }

      if (ikTargetLeftHand) {
        if (!leftWrist.visibility || leftWrist.visibility < 0.5) continue
        if (!leftWrist.x || !leftWrist.y || !leftWrist.z) continue
        const ik = getComponent(ikTargetLeftHand, TransformComponent)
        leftHandPos
          .set(leftWrist.x, leftWrist.y, leftWrist.z)
          .multiplyScalar(-1)
          .applyQuaternion(avatarTransform.rotation)
          .add(hipsPos)
        ik.position.copy(leftHandPos)
        // ik.quaternion.copy()
      }

      if (ikTargetRightHand) {
        if (!rightWrist.visibility || rightWrist.visibility < 0.5) continue
        if (!rightWrist.x || !rightWrist.y || !rightWrist.z) continue
        const ik = getComponent(ikTargetRightHand, TransformComponent)
        rightHandPos
          .set(rightWrist.x, rightWrist.y, rightWrist.z)
          .multiplyScalar(-1)
          .applyQuaternion(avatarTransform.rotation)
          .add(hipsPos)
        ik.position.copy(rightHandPos)
        // ik.quaternion.copy()
      }
    }
  }
}

const reactor = () => {
  useEffect(() => {
    addDataChannelHandler(mocapDataChannelType, handleMocapData)

    return () => {
      removeDataChannelHandler(mocapDataChannelType, handleMocapData)
    }
  }, [])
  return null
}

export const MotionCaptureSystem = defineSystem({
  uuid: 'ee.engine.MotionCaptureSystem',
  execute,
  reactor
})
