export interface ServerSetting {
  id: string
  hostname?: string
  mode?: string
  port?: string
  clientHost?: string
  rootDir?: string
  publicDir?: string
  nodeModulesDir?: string
  localStorageProvider?: string
  performDryRun?: boolean
  storageProvider?: string
  gaTrackingId?: string
  hub: HubInfo
  paginate?: number
  url?: string
  certPath?: string
  keyPath?: string
  gitPem?: string
  local?: boolean
  releaseName?: string
  instanceserverUnreachableTimeoutSeconds?: number
  githubWebhookSecret?: string
}

export interface HubInfo {
  endpoint?: string
}

export interface PatchServerSetting {
  gaTrackingId?: string
  githubWebhookSecret?: string
  instanceserverUnreachableTimeoutSeconds?: number
}
