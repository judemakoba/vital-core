export class ApiError extends Error {
  public readonly status: number
  public readonly code: string
  public readonly details?: unknown

  constructor(status: number, message: string, code: string, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ApiError)
    }
  }

  static badRequest(message: string, details?: unknown) {
    return new ApiError(400, message, 'BAD_REQUEST', details)
  }

  static unauthorized(message = 'Unauthorized', details?: unknown) {
    return new ApiError(401, message, 'UNAUTHORIZED', details)
  }

  static forbidden(message = 'Forbidden', details?: unknown) {
    return new ApiError(403, message, 'FORBIDDEN', details)
  }

  static notFound(message = 'Resource not found', details?: unknown) {
    return new ApiError(404, message, 'NOT_FOUND', details)
  }

  static conflict(message: string, details?: unknown) {
    return new ApiError(409, message, 'CONFLICT', details)
  }

  static tooManyRequests(message = 'Too many requests', details?: unknown) {
    return new ApiError(429, message, 'RATE_LIMITED', details)
  }

  static internal(message = 'Internal server error', details?: unknown) {
    return new ApiError(500, message, 'INTERNAL_ERROR', details)
  }

  static serviceUnavailable(message = 'Service unavailable', details?: unknown) {
    return new ApiError(503, message, 'SERVICE_UNAVAILABLE', details)
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details && { details: this.details }),
      },
    }
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}

export function handleApiError(error: unknown): ApiError {
  if (isApiError(error)) return error

  if (error instanceof Error) {
    if (error.name === 'PrismaClientKnownRequestError') {
      const prismaError = error as any
      if (prismaError.code === 'P2002') {
        return ApiError.conflict('A record with this value already exists', prismaError.meta)
      }
      if (prismaError.code === 'P2025') {
        return ApiError.notFound('Record not found')
      }
    }
    if (error.name === 'ZodError') {
      return ApiError.badRequest('Validation failed', error)
    }
    return ApiError.internal(error.message)
  }

  return ApiError.internal('An unexpected error occurred')
}
