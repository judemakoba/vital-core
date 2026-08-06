import pino from 'pino'

const isDevelopment = process.env.NODE_ENV !== 'production'

export const logger = pino({
  level: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),
  ...(!isDevelopment && {
    formatters: {
      level: (label) => ({ level: label }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  }),
  ...(isDevelopment && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    },
  }),
})

export const createChildLogger = (bindings: Record<string, unknown>) => 
  logger.child(bindings)

// Request logging middleware helper
export function logRequest(
  method: string,
  url: string,
  statusCode: number,
  durationMs: number,
  meta?: Record<string, unknown>
) {
  logger.info({
    method,
    url,
    statusCode,
    durationMs,
    ...meta,
  }, 'HTTP Request')
}
