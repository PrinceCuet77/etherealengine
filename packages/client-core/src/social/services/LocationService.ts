import { Paginated } from '@feathersjs/feathers'

import { Location, LocationSeed } from '@etherealengine/common/src/interfaces/Location'
import { UserId } from '@etherealengine/common/src/interfaces/UserId'
import { matches, Validator } from '@etherealengine/engine/src/common/functions/MatchesUtils'
import { Engine } from '@etherealengine/engine/src/ecs/classes/Engine'
import { defineAction, defineState, dispatchAction, getMutableState, useState } from '@etherealengine/hyperflux'

import { API } from '../../API'
import { NotificationService } from '../../common/services/NotificationService'

export const LocationState = defineState({
  name: 'LocationState',
  initial: () => ({
    offline: false,
    locationName: null! as string,
    currentLocation: {
      location: LocationSeed as Location,
      bannedUsers: [] as UserId[],
      selfUserBanned: false,
      selfNotAuthorized: false
    },
    updateNeeded: true,
    currentLocationUpdateNeeded: true,
    fetchingCurrentLocation: false,
    invalidLocation: false
  })
})

export const LocationServiceReceptor = (action) => {
  const s = getMutableState(LocationState)
  matches(action)
    .when(LocationAction.setLocationName.matches, (action) => {
      return s.merge({
        locationName: action.locationName
      })
    })
    .when(LocationAction.fetchingCurrentSocialLocation.matches, () => {
      return s.merge({
        fetchingCurrentLocation: true,
        currentLocation: {
          location: LocationSeed as Location,
          bannedUsers: [] as UserId[],
          selfUserBanned: false,
          selfNotAuthorized: false
        },
        updateNeeded: true,
        currentLocationUpdateNeeded: true
      })
    })
    .when(LocationAction.socialLocationRetrieved.matches, (action) => {
      let bannedUsers = [] as UserId[]
      ;(action.location as any)?.location_bans?.forEach((ban) => {
        bannedUsers.push(ban.userId)
      })
      bannedUsers = [...new Set(bannedUsers)]
      return s.merge({
        currentLocation: {
          location: {
            ...action.location,
            locationSetting: (action.location as any).location_setting
          },
          bannedUsers,
          selfUserBanned: false,
          selfNotAuthorized: false
        },
        currentLocationUpdateNeeded: false,
        fetchingCurrentLocation: false
      })
    })
    .when(LocationAction.socialLocationNotFound.matches, () => {
      return s.merge({
        currentLocation: {
          location: LocationSeed,
          bannedUsers: [],
          selfUserBanned: false,
          selfNotAuthorized: false
        },
        currentLocationUpdateNeeded: false,
        fetchingCurrentLocation: false,
        invalidLocation: true
      })
    })
    .when(LocationAction.socialLocationBanCreated.matches, () => {
      return s.merge({ currentLocationUpdateNeeded: true })
    })
    .when(LocationAction.socialSelfUserBanned.matches, (action) => {
      s.merge({ currentLocationUpdateNeeded: true })
      s.currentLocation.merge({ selfUserBanned: action.banned })
      return
    })
    .when(LocationAction.socialLocationNotAuthorized.matches, (action) => {
      s.merge({ currentLocationUpdateNeeded: true })
      return s.currentLocation.merge({ selfNotAuthorized: true })
    })
}

/**@deprecated use getMutableState directly instead */
export const accessLocationState = () => getMutableState(LocationState)
/**@deprecated use useHookstate(getMutableState(...) directly instead */
export const useLocationState = () => useState(accessLocationState())

export const LocationService = {
  getLocation: async (locationId: string) => {
    try {
      dispatchAction(LocationAction.fetchingCurrentSocialLocation({}))
      const location = await API.instance.client.service('location').get(locationId)
      dispatchAction(LocationAction.socialLocationRetrieved({ location }))
    } catch (err) {
      NotificationService.dispatchNotify(err.message, { variant: 'error' })
    }
  },
  getLocationByName: async (locationName: string) => {
    dispatchAction(LocationAction.fetchingCurrentSocialLocation({}))
    const locationResult = (await API.instance.client.service('location').find({
      query: {
        slugifiedName: locationName,
        joinableLocations: true
      }
    })) as Paginated<Location>

    if (locationResult && locationResult.total > 0) {
      if (
        locationResult.data[0].location_setting?.locationType === 'private' &&
        !locationResult.data[0].location_authorized_users?.find(
          (authUser) => authUser.userId === Engine.instance.userId
        )
      ) {
        dispatchAction(LocationAction.socialLocationNotAuthorized({ location: locationResult.data[0] }))
      } else dispatchAction(LocationAction.socialLocationRetrieved({ location: locationResult.data[0] }))
    } else {
      dispatchAction(LocationAction.socialLocationNotFound({}))
    }
  },
  getLobby: async () => {
    const lobbyResult = (await API.instance.client.service('location').find({
      query: {
        isLobby: true,
        $limit: 1
      }
    })) as Paginated<Location>

    if (lobbyResult && lobbyResult.total > 0) {
      return lobbyResult.data[0]
    } else {
      return null
    }
  },
  banUserFromLocation: async (userId: string, locationId: string) => {
    try {
      await API.instance.client.service('location-ban').create({
        userId: userId,
        locationId: locationId
      })
      dispatchAction(LocationAction.socialLocationBanCreated({}))
    } catch (err) {
      NotificationService.dispatchNotify(err.message, { variant: 'error' })
    }
  }
}

//Action
export class LocationAction {
  static setLocationName = defineAction({
    type: 'ee.client.Location.LOCATION_NAME_SET' as const,
    locationName: matches.string
  })

  static socialLocationRetrieved = defineAction({
    type: 'ee.client.Location.LOCATION_RETRIEVED' as const,
    location: matches.object as Validator<unknown, Location>
  })

  static socialLocationBanCreated = defineAction({
    type: 'ee.client.Location.LOCATION_BAN_CREATED' as const
  })

  static fetchingCurrentSocialLocation = defineAction({
    type: 'ee.client.Location.FETCH_CURRENT_LOCATION' as const
  })

  static socialLocationNotFound = defineAction({
    type: 'ee.client.Location.LOCATION_NOT_FOUND' as const
  })

  static socialLocationNotAuthorized = defineAction({
    type: 'ee.client.Location.LOCATION_NOT_AUTHORIZED' as const,
    location: matches.object as Validator<unknown, Location>
  })

  static socialSelfUserBanned = defineAction({
    type: 'ee.client.Location.LOCATION_LOCAL_USER_BANNED' as const,
    banned: matches.boolean
  })
}
