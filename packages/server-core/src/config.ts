import type { PlainTransportOptions } from 'mediasoup/node/lib/PlainTransport'

import configFile from './appconfig'
import { SctpParameters } from './types/SctpParameters'

export const sctpParameters: SctpParameters = {
  OS: 1024,
  MIS: 65535,
  maxMessageSize: 65535,
  port: 5000
}

export const config = {
  httpPeerStale: 15000,
  mediasoup: {
    worker: {
      rtcMinPort: 40000,
      rtcMaxPort: 49999,
      logLevel: 'info',
      logTags: ['info', 'ice', 'dtls', 'rtp', 'srtp', 'rtcp']
    },
    router: {
      mediaCodecs: [
        {
          kind: 'audio',
          mimeType: 'audio/opus',
          clockRate: 48000,
          channels: 2
        },
        {
          kind: 'video',
          mimeType: 'video/VP8',
          clockRate: 90000,
          parameters: {
            //                'x-google-start-bitrate': 1000
          }
        },
        {
          kind: 'video',
          mimeType: 'video/h264',
          clockRate: 90000,
          parameters: {
            'packetization-mode': 1,
            'profile-level-id': '4d0032',
            'level-asymmetry-allowed': 1
          }
        },
        {
          kind: 'video',
          mimeType: 'video/h264',
          clockRate: 90000,
          parameters: {
            'packetization-mode': 1,
            'profile-level-id': '42e01f',
            'level-asymmetry-allowed': 1
          }
        }
      ]
    },

    // rtp listenIps are the most important thing, below. you'll need
    // to set these appropriately for your network for the demo to
    // run anywhere but on 127.0.0.1
    webRtcTransport: {
      listenIps: [{ ip: configFile.instanceserver.hostname as string, announcedIp: null! as string }],
      initialAvailableOutgoingBitrate: 1000 * 1000 * 1000,
      maxIncomingBitrate: 0
    }
  }
}

export const localConfig = {
  httpPeerStale: 15000,
  mediasoup: {
    worker: {
      rtcMinPort: configFile.instanceserver.rtc_start_port,
      rtcMaxPort: configFile.instanceserver.rtc_end_port,
      logLevel: 'info',
      logTags: ['info', 'ice', 'dtls', 'rtp', 'srtp', 'rtcp']
    },
    router: {
      mediaCodecs: [
        {
          kind: 'audio',
          mimeType: 'audio/opus',
          clockRate: 48000,
          channels: 2
        },
        {
          kind: 'video',
          mimeType: 'video/VP8',
          preferredPayloadType: 96,
          clockRate: 90000,
          parameters: {
            //'x-google-start-bitrate': 1000
          }
        },
        {
          kind: 'video',
          mimeType: 'video/h264',
          clockRate: 90000,
          parameters: {
            'packetization-mode': 1,
            'profile-level-id': '4d0032',
            'level-asymmetry-allowed': 1
          }
        },
        {
          kind: 'video',
          mimeType: 'video/h264',
          clockRate: 90000,
          parameters: {
            'packetization-mode': 1,
            'profile-level-id': '42e01f',
            'level-asymmetry-allowed': 1
          }
        }
      ]
    },

    // rtp listenIps are the most important thing, below. you'll need
    // to set these appropriately for your network for the demo to
    // run anywhere but on 127.0.0.1
    webRtcTransport: {
      listenIps: [{ ip: configFile.instanceserver.hostname!, announcedIp: null! as string }],
      initialAvailableOutgoingBitrate: 1000 * 1000 * 1000,
      maxIncomingBitrate: 0
    },

    plainTransport: {
      listenIp: { ip: configFile.instanceserver.hostname }
    } as PlainTransportOptions,

    recording: {
      ip: configFile.instanceserver.hostname,

      // FFmpeg's sdpdemux only supports RTCP = RTP + 1
      audioPort: 5004,
      audioPortRtcp: 5005,
      videoPort: 5006,
      videoPortRtcp: 5007
    }
  }
}
