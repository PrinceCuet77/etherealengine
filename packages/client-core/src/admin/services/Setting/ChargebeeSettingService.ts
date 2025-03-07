import { Paginated } from '@feathersjs/feathers'

import { matches, Validator } from '@etherealengine/engine/src/common/functions/MatchesUtils'
import {
  chargebeeSettingPath,
  ChargebeeSettingType
} from '@etherealengine/engine/src/schemas/setting/chargebee-setting.schema'
import { defineAction, defineState, dispatchAction, getMutableState } from '@etherealengine/hyperflux'

import { API } from '../../../API'
import { NotificationService } from '../../../common/services/NotificationService'

export const AdminChargebeeSettingsState = defineState({
  name: 'AdminChargebeeSettingsState',
  initial: () => ({
    chargebee: [] as Array<ChargebeeSettingType>,
    updateNeeded: true
  })
})

const chargebeeSettingRetrievedReceptor = (
  action: typeof AdminChargebeeSettingActions.chargebeeSettingRetrieved.matches._TYPE
) => {
  const state = getMutableState(AdminChargebeeSettingsState)
  return state.merge({ chargebee: action.chargebeeSetting.data, updateNeeded: false })
}

export const AdminChargebeeReceptors = {
  chargebeeSettingRetrievedReceptor
}

export const ChargebeeSettingService = {
  fetchChargeBee: async () => {
    try {
      const chargeBee = (await API.instance.client
        .service(chargebeeSettingPath)
        .find()) as Paginated<ChargebeeSettingType>
      dispatchAction(AdminChargebeeSettingActions.chargebeeSettingRetrieved({ chargebeeSetting: chargeBee }))
    } catch (err) {
      NotificationService.dispatchNotify(err.message, { variant: 'error' })
    }
  }
}

export class AdminChargebeeSettingActions {
  static chargebeeSettingRetrieved = defineAction({
    type: 'ee.client.AdminChargebeeSetting.ADMIN_CHARGEBEE_SETTING_FETCHED' as const,
    chargebeeSetting: matches.object as Validator<unknown, Paginated<ChargebeeSettingType>>
  })
}
