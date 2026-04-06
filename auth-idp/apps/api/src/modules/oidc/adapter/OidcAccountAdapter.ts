import type { Account, Claims } from 'oidc-provider'
import type { IUserRepository } from '../../users/application/ports/IUserRepository.js'
import type { Logger } from '../../../shared/logger/logger.js'


export class OidcAccountAdapter {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly logger: Logger,
  ) {}

  async findAccount(_ctx: unknown, sub: string): Promise<Account | undefined> {
    const userResult = await this.userRepository.findById(sub)
    if (userResult.isErr()) {
      this.logger.warn({ sub }, 'OIDC account lookup failed — user not found')
      return undefined
    }

    const user = userResult.value
    if (!user.isActive() && !user.isPendingVerification()) {
      this.logger.warn({ sub, status: user.status }, 'OIDC account not active')
      return undefined
    }

    const profileResult = await this.userRepository.findProfile(sub)

    return {
      accountId: sub,
      async claims(use: string, scope: string): Promise<Claims> {
        const base: Claims = { sub }

        if (scope.includes('email')) {
          base['email'] = user.email
          base['email_verified'] = user.emailVerified
        }

        if (scope.includes('profile') && profileResult.isOk()) {
          const profile = profileResult.value
          base['given_name'] = profile.givenName ?? undefined
          base['family_name'] = profile.familyName ?? undefined
          base['name'] = profile.fullName() ?? undefined
          base['picture'] = profile.pictureUrl ?? undefined
          base['locale'] = profile.locale
          base['zoneinfo'] = profile.zoneinfo
          base['updated_at'] = Math.floor(profile.updatedAt.getTime() / 1000)
        }

        return base
      },
    }
  }
}