import pino from 'pino'

export function createLogger(module: string): pino.Logger {
  // Read directly from process.env with safe defaults.
  // Logger must work before loadConfig() runs — it's a foundational primitive.
  const level = (process.env['LOG_LEVEL'] ?? 'info') as pino.Level
  const isDev = process.env['NODE_ENV'] !== 'production'

  return pino(
    {
      level,
      base: { module },
      timestamp: pino.stdTimeFunctions.isoTime,
      redact: {
        paths: ['password', 'secret', 'privateKey', 'accessToken', 'refreshToken'],
        censor: '[REDACTED]',
      },
    },
    isDev
      ? pino.transport({
          target: 'pino-pretty',
          options: { colorize: true, ignore: 'pid,hostname', translateTime: 'HH:MM:ss.l' },
        })
      : undefined,
  )
}

export type Logger = pino.Logger