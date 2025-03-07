/**
 * An object for swagger documentation configuration
 */
export default {
  definitions: {
    'location-admin': {
      type: 'object',
      properties: {}
    },
    'location-admin_list': {
      type: 'array',
      items: { $ref: '#/definitions/location-admin' }
    }
  },
  securities: ['create', 'update', 'patch', 'remove'],
  operations: {
    find: {
      security: [{ bearer: [] }]
    }
  }
}
