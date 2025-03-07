import { Location } from '@etherealengine/common/src/interfaces/Location'

import { locationSettingsSeed } from '../location-settings/location-settings.seed'

export const locationSeed = {
  path: 'location',
  insertSingle: true,
  templates: [
    {
      id: '98cbcc30-fd2d-11ea-bc7c-cd4cac9a8d60',
      name: 'Default',
      slugifiedName: 'default',
      maxUsersPerInstance: 30,
      sceneId: 'default-project/default',
      location_settings: locationSettingsSeed.templates.find(
        (template) => template.locationId === '98cbcc30-fd2d-11ea-bc7c-cd4cac9a8d60'
      ),
      isLobby: false
    } as Location,
    {
      id: '98cbcc30-fd2d-11ea-bc7c-cd4cac9a8d62',
      name: 'Sky Station',
      slugifiedName: 'sky-station',
      maxUsersPerInstance: 30,
      sceneId: 'default-project/sky-station',
      location_settings: locationSettingsSeed.templates.find(
        (template) => template.locationId === '98cbcc30-fd2d-11ea-bc7c-cd4cac9a8d62'
      ),
      isLobby: false
    } as Location,
    {
      id: '98cbcc30-fd2d-11ea-bc7c-cd4cac9a8d63',
      name: 'Apartment',
      slugifiedName: 'apartment',
      maxUsersPerInstance: 30,
      sceneId: 'default-project/apartment',
      location_settings: locationSettingsSeed.templates.find(
        (template) => template.locationId === '98cbcc30-fd2d-11ea-bc7c-cd4cac9a8d63'
      ),
      isLobby: false
    } as Location
  ]
}
