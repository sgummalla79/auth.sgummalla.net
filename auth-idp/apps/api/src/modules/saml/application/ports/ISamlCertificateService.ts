import type { Result } from '../../../../shared/result/Result.js'
import type { InternalError } from '../../../../shared/errors/AppError.js'

/**
 * Converts an RSA key pair into a self-signed X.509 certificate.
 * SAML metadata requires a <ds:X509Certificate> — a bare RSA public key
 * (SPKI PEM) is not accepted by most SPs.
 *
 * Caches by kid so we only generate once per key per process lifetime.
 */
export interface ISamlCertificateService {
  generateOrGetCert(
    kid: string,
    privateKeyPem: string,
    publicKeyPem: string,
  ): Promise<Result<string, InternalError>>
}