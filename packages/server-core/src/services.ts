import fs from 'fs'
import path from 'path'

import { ProjectConfigInterface } from '@etherealengine/projects/ProjectConfigInterface'

import { Application } from '../declarations'
import AnalyticsServices from './analytics/services'
import AssetServices from './assets/services'
import BotService from './bot/services'
import ClusterServices from './cluster/services'
import MatchMakingServices from './matchmaking/services'
import MediaServices from './media/services'
import NetworkingServices from './networking/services'
import EntityServices from './projects/services'
import RecordingServices from './recording/services'
import RouteService from './route/service'
import ScopeService from './scope/service'
import SettingService from './setting/service'
import SocialServices from './social/services'
import UserServices from './user/services'

const installedProjects = fs.existsSync(path.resolve(__dirname, '../../projects/projects'))
  ? fs
      .readdirSync(path.resolve(__dirname, '../../projects/projects'), { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => {
        try {
          const config: ProjectConfigInterface =
            require(`../../projects/projects/${dirent.name}/xrengine.config.ts`).default
          if (!config.services) return null
          return path.join(dirent.name, config.services)
        } catch (e) {
          // console.log(e)
        }
      })
      .filter((hasServices) => !!hasServices)
      .map((servicesDir) => {
        return require(`../../projects/projects/${servicesDir}`).default
      })
      .flat()
  : []

export default (app: Application): void => {
  ;[
    ...AnalyticsServices,
    ...UserServices,
    ...AssetServices,
    ...MediaServices,
    ...EntityServices,
    ...NetworkingServices,
    ...SocialServices,
    ...BotService,
    ...ScopeService,
    ...SettingService,
    ...RouteService,
    ...RecordingServices,
    ...installedProjects,
    ...MatchMakingServices,
    ...ClusterServices
  ].forEach((service) => {
    app.configure(service)
  })
}
