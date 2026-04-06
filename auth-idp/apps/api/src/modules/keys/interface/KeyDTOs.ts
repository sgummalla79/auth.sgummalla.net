export const GenerateKeySchema = {
  type: 'object',
  properties: {
    algorithm: { type: 'string', enum: ['RS256','RS384','RS512','ES256','ES384','ES512'], default: 'RS256' },
    expiresInDays: { type: 'integer', minimum: 1, maximum: 365, default: 90 },
  },
  additionalProperties: false,
}

export const RotateKeySchema = {
  type: 'object',
  properties: {
    algorithm: { type: 'string', enum: ['RS256','RS384','RS512','ES256','ES384','ES512'], default: 'RS256' },
    expiresInDays: { type: 'integer', minimum: 1, maximum: 365, default: 90 },
  },
  additionalProperties: false,
}