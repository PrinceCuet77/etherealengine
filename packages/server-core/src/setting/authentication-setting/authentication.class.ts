import { Paginated, Params } from '@feathersjs/feathers'
import * as k8s from '@kubernetes/client-node'
import { SequelizeServiceOptions, Service } from 'feathers-sequelize'

import { AdminAuthSetting as AdminAuthSettingInterface } from '@etherealengine/common/src/interfaces/AdminAuthSetting'
import { UserInterface } from '@etherealengine/common/src/interfaces/User'
import { getState } from '@etherealengine/hyperflux'

import { Application } from '../../../declarations'
import config from '../../appconfig'
import logger from '../../ServerLogger'
import { ServerState } from '../../ServerState'
import { UserParams } from '../../user/user/user.class'

export type AdminAuthSettingDataType = AdminAuthSettingInterface

export class Authentication<T = AdminAuthSettingDataType> extends Service<T> {
  app: Application

  constructor(options: Partial<SequelizeServiceOptions>, app: Application) {
    super(options)
    this.app = app
  }

  async find(params?: UserParams): Promise<T[] | Paginated<T>> {
    const auth = (await super.find()) as any
    const loggedInUser = params!.user as UserInterface
    const data = auth.data.map((el) => {
      let oauth = JSON.parse(el.oauth)
      let authStrategies = JSON.parse(el.authStrategies)
      let jwtOptions = JSON.parse(el.jwtOptions)
      let bearerToken = JSON.parse(el.bearerToken)
      let callback = JSON.parse(el.callback)

      if (typeof oauth === 'string') oauth = JSON.parse(oauth)
      if (typeof authStrategies === 'string') authStrategies = JSON.parse(authStrategies)
      if (typeof jwtOptions === 'string') jwtOptions = JSON.parse(jwtOptions)
      if (typeof bearerToken === 'string') bearerToken = JSON.parse(bearerToken)
      if (typeof callback === 'string') callback = JSON.parse(callback)

      if (!loggedInUser.scopes || !loggedInUser.scopes.find((scope) => scope.type === 'admin:admin'))
        return {
          id: el.id,
          entity: el.entity,
          service: el.service,
          authStrategies: authStrategies
        }

      const returned = {
        ...el,
        authStrategies: authStrategies,
        jwtOptions: jwtOptions,
        bearerToken: bearerToken,
        callback: callback,
        oauth: {
          ...oauth
        }
      }
      if (oauth.defaults) returned.oauth.defaults = JSON.parse(oauth.defaults)
      if (oauth.discord) returned.oauth.discord = JSON.parse(oauth.discord)
      if (oauth.facebook) returned.oauth.facebook = JSON.parse(oauth.facebook)
      if (oauth.github) returned.oauth.github = JSON.parse(oauth.github)
      if (oauth.google) returned.oauth.google = JSON.parse(oauth.google)
      if (oauth.linkedin) returned.oauth.linkedin = JSON.parse(oauth.linkedin)
      if (oauth.twitter) returned.oauth.twitter = JSON.parse(oauth.twitter)
      return returned
    })
    return {
      total: auth.total,
      limit: auth.limit,
      skip: auth.skip,
      data
    }
  }

  async patch(id: string, data: any, params?: Params): Promise<T[] | T> {
    const authSettings = await this.app.service('authentication-setting').get(id)
    let existingCallback = JSON.parse(authSettings.callback as any)
    if (typeof existingCallback === 'string') existingCallback = JSON.parse(existingCallback)

    let newOAuth = JSON.parse(data.oauth)
    data.callback = existingCallback

    for (let key of Object.keys(newOAuth)) {
      newOAuth[key] = JSON.parse(newOAuth[key])
      if (config.authentication.oauth[key]?.scope) newOAuth[key].scope = config.authentication.oauth[key].scope
      if (config.authentication.oauth[key]?.custom_data)
        newOAuth[key].custom_data = config.authentication.oauth[key].custom_data
      if (key !== 'defaults' && !data.callback[key]) data.callback[key] = `${config.client.url}/auth/oauth/${key}`
      newOAuth[key] = JSON.stringify(newOAuth[key])
    }

    data.oauth = JSON.stringify(newOAuth)
    data.callback = JSON.stringify(data.callback)

    const patchResult = await super.patch(id, data, params)

    const k8AppsClient = getState(ServerState).k8AppsClient

    if (k8AppsClient) {
      try {
        logger.info('Attempting to refresh API pods')
        const refreshApiPodResponse = await k8AppsClient.patchNamespacedDeployment(
          `${config.server.releaseName}-etherealengine-api`,
          'default',
          {
            spec: {
              template: {
                metadata: {
                  annotations: {
                    'kubectl.kubernetes.io/restartedAt': new Date().toISOString()
                  }
                }
              }
            }
          },
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          {
            headers: {
              'Content-Type': k8s.PatchUtils.PATCH_FORMAT_STRATEGIC_MERGE_PATCH
            }
          }
        )
        logger.info(refreshApiPodResponse, 'updateBuilderTagResponse')
      } catch (e) {
        logger.error(e)
        return e
      }
    }

    return patchResult
  }
}
