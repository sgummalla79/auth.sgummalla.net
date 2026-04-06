import forge from 'node-forge'
import { ok, err } from '../../../shared/result/Result.js'
import type { Result } from '../../../shared/result/Result.js'
import { InternalError } from '../../../shared/errors/AppError.js'
import type { ISamlCertificateService } from '../application/ports/ISamlCertificateService.js'

/**
 * ForgeSamlCertificateService — generates a self-signed X.509 certificate
 * from an RSA key pair using node-forge.
 *
 * SAML metadata requires a <ds:X509Certificate> (DER base64) — not a bare
 * RSA public key. The cert is valid for 10 years and self-signed by the IDP.
 *
 * Results are cached in-process by kid to avoid regenerating on every request.
 * On key rotation the kid changes, so the old cached cert is naturally evicted
 * when the process recycles (or remains harmlessly in memory with a dead kid).
 */
export class ForgeSamlCertificateService implements ISamlCertificateService {
  private readonly certCache = new Map<string, string>()

  async generateOrGetCert(
    kid: string,
    privateKeyPem: string,
    publicKeyPem: string,
  ): Promise<Result<string, InternalError>> {
    // Cache hit
    const cached = this.certCache.get(kid)
    if (cached) return ok(cached)

    try {
      const privateKey = forge.pki.privateKeyFromPem(privateKeyPem)
      const publicKey  = forge.pki.publicKeyFromPem(publicKeyPem)

      const cert = forge.pki.createCertificate()
      cert.publicKey = publicKey
      cert.serialNumber = Buffer.from(kid).toString('hex').slice(0, 20)

      const now = new Date()
      const tenYearsFromNow = new Date(now)
      tenYearsFromNow.setFullYear(now.getFullYear() + 10)

      cert.validity.notBefore = now
      cert.validity.notAfter  = tenYearsFromNow

      const attrs = [
        { name: 'commonName',         value: 'auth IDP Signing Certificate' },
        { name: 'organizationName',   value: 'auth.sgummalla.net' },
        { name: 'organizationalUnitName', value: 'Identity Provider' },
      ]
      cert.setSubject(attrs)
      cert.setIssuer(attrs)

      // Key usage: digital signature only
      cert.setExtensions([
        { name: 'basicConstraints', cA: false },
        { name: 'keyUsage', digitalSignature: true, nonRepudiation: true },
      ])

      cert.sign(privateKey, forge.md.sha256.create())

      const certPem = forge.pki.certificateToPem(cert)
      this.certCache.set(kid, certPem)
      return ok(certPem)
    } catch (e) {
      return err(new InternalError('Failed to generate SAML signing certificate', e))
    }
  }
}