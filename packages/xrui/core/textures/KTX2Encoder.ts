import { ImageDataType } from '@loaders.gl/images'

import { WorkerPool } from '../WorkerPool'
import KTX2WorkerBody from './KTX2Worker.bundle.txt?raw'

const workerBlob = new Blob([KTX2WorkerBody], { type: 'text/javascript' })
const workerURL = URL.createObjectURL(workerBlob)

export type EncodeRequest = {
  image: ImageDataType
  useSRGB?: boolean
  qualityLevel?: number
  encodeUASTC?: boolean
  mipmaps?: boolean
}

export type EncodeResponse = {
  texture: ArrayBuffer
  error?: string
}

export class KTX2Encoder {
  pool = new WorkerPool(1)

  constructor() {
    this.pool.setWorkerCreator(() => new Worker(workerURL))
  }

  setWorkerLimit(limit: number) {
    this.pool.setWorkerLimit(limit)
  }

  async encode(
    imageData: ImageDataType,
    useSRGB = false,
    qualityLevel = 10,
    encodeUASTC = false,
    mipmaps = true
  ): Promise<ArrayBuffer> {
    const responseMessage = await this.pool.postMessage<EncodeResponse>(
      {
        image: imageData,
        useSRGB,
        qualityLevel,
        encodeUASTC,
        mipmaps
      } as EncodeRequest,
      [imageData.data.buffer]
    )
    if (responseMessage.data.error) throw new Error(responseMessage.data.error)
    if (!responseMessage.data.texture) throw new Error('Encoding failed')
    return responseMessage.data.texture
  }
}
