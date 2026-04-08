import { describe, it, expect } from 'vitest'
import { ForgeCertThumbprintExtractor } from '../../modules/jwt/infrastructure/ForgeCertThumbprintExtractor.js'
import { isOk, isErr } from '../../shared/result/Result.js'

const TEST_CERT = `-----BEGIN CERTIFICATE-----
MIIC/zCCAeegAwIBAgIUIyp08Po1w8ucSJcu39GmoIKksyQwDQYJKoZIhvcNAQEL
BQAwDzENMAsGA1UEAwwEdGVzdDAeFw0yNjA0MDYyMzU1MjhaFw0zNjA0MDMyMzU1
MjhaMA8xDTALBgNVBAMMBHRlc3QwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEK
AoIBAQDGSzsiFqV2WFFMA7h+lrcfN+LRGUwHWZFysCYpjBds6W0viLAnb4T/msxl
YXg+dYpnLjyB7tAU0NPh6nPAuSYauqVy3bQjFvRTuMIhl/ozI7w5nSNByKvJc1Na
pefeIn2kGXeyc21e691vsssAfjf+LVw8lallSwaZepTu0Kp9gXVv3r365stUow0A
XgeZz6VvC5t3ejUvVgCx49m7IziQYdW9SpyJF5AAtIIWp2vCjUnGvfW31RDXtw8t
8x21Jcg+8BDEW5PmzbWTzH3amiDX6YpML9whiTVeNzTliKnO3eI8yMgpOQLtyImH
LuX4JOES41oCJ0fmikL/Oa6YdEHXAgMBAAGjUzBRMB0GA1UdDgQWBBQ6jWhYBl5b
QGuFc9Gi8clDPYSCJDAfBgNVHSMEGDAWgBQ6jWhYBl5bQGuFc9Gi8clDPYSCJDAP
BgNVHRMBAf8EBTADAQH/MA0GCSqGSIb3DQEBCwUAA4IBAQBdRZUdz17JNmeQ8Q66
tM08hA7lyUTgWX1Q6u1OAwqbfW2KdJQvZQsqVGzul866ZQFINbE4vuzS3HigKOcs
NkV7pycMnHuFjPojt6b6/k6GyHs3f5qjz+dP8pSEXxyxxTs7rTSZB9jZPB0t7xZF
Ru6K4CccTq18hNyeM1IUc85o8N++L0MX5dcIw/iBcplUzxY57eT5qqvYGN/o8HqN
lYt75pwlb2AzoemtWpiA9hF2nRT8/xq2VAkVZvbpbW+ksG+n/7xG/r4jw4yl3y/S
Qur3m2IafRv83iS/KMRfmAdHmCg79DqWbT9Sl0/2pTYEWvaEG6ePrzK1rrquUUCv
pHOS
-----END CERTIFICATE-----`

describe('ForgeCertThumbprintExtractor', () => {
  const extractor = new ForgeCertThumbprintExtractor()

  it('returns a 40-char hex thumbprint for a valid cert', () => {
    const result = extractor.extract(TEST_CERT)
    expect(isOk(result)).toBe(true)
    if (isOk(result)) {
      expect(result.value).toMatch(/^[a-f0-9]{40}$/)
    }
  })

  it('returns the same thumbprint on repeated calls (deterministic)', () => {
    const r1 = extractor.extract(TEST_CERT)
    const r2 = extractor.extract(TEST_CERT)
    expect(isOk(r1) && isOk(r2)).toBe(true)
    if (isOk(r1) && isOk(r2)) {
      expect(r1.value).toBe(r2.value)
    }
  })

  it('returns UnauthorizedError for invalid PEM', () => {
    const result = extractor.extract('not a cert')
    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error.code).toBe('UNAUTHORIZED')
    }
  })
})