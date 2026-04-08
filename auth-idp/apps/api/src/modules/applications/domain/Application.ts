import type { AuthProtocol, ApplicationStatus } from '../../../shared/types/domain-types.js'

export class Application {
  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly slug: string,
    public readonly protocol: AuthProtocol,
    public readonly status: ApplicationStatus,
    public readonly logoUrl: string | null,
    public readonly description: string | null,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}

  isActive(): boolean { return this.status === 'active' }
  isSaml(): boolean { return this.protocol === 'saml' }
  isOidc(): boolean { return this.protocol === 'oidc' }
  isJwt(): boolean { return this.protocol === 'jwt' }
}

export class SamlConfig {
  constructor(
    public readonly id: string,
    public readonly applicationId: string,
    public readonly entityId: string,
    public readonly acsUrl: string,
    public readonly sloUrl: string | null,
    public readonly spCertificate: string | null,
    public readonly nameIdFormat: string,
    public readonly signAssertions: boolean,
    public readonly signResponse: boolean,
    public readonly encryptAssertions: boolean,
    public readonly attributeMappings: Record<string, string>,
  ) {}
}

export class OidcClient {
  constructor(
    public readonly id: string,
    public readonly applicationId: string,
    public readonly clientId: string,
    public readonly clientSecretHash: string,
    public readonly redirectUris: string[],
    public readonly postLogoutUris: string[],
    public readonly grantTypes: string[],
    public readonly responseTypes: string[],
    public readonly scopes: string[],
    public readonly tokenEndpointAuth: string,
    public readonly pkceRequired: boolean,
    public readonly accessTokenTtl: number | null,
    public readonly refreshTokenTtl: number | null,
  ) {}
}

export class JwtConfig {
  constructor(
    public readonly id: string,
    public readonly applicationId: string,
    public readonly signingAlgorithm: string,
    public readonly publicKey: string | null,
    public readonly certThumbprint: string | null,
    public readonly tokenLifetime: number,
    public readonly audience: string[],
    public readonly customClaims: Record<string, unknown>,
  ) {}
}