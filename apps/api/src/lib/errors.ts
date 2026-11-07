export class HttpError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message = "Authentication required") {
    super(401, "UNAUTHORIZED", message);
  }
}

export class ForbiddenError extends HttpError {
  constructor(message = "You do not have permission to perform this action") {
    super(403, "FORBIDDEN", message);
  }
}

export class NotFoundError extends HttpError {
  constructor(message = "Resource not found") {
    super(404, "NOT_FOUND", message);
  }
}

export class ValidationError extends HttpError {
  details: unknown;
  constructor(message = "Invalid request", details?: unknown) {
    super(400, "VALIDATION_ERROR", message);
    this.details = details;
  }
}

export class ConflictError extends HttpError {
  constructor(message = "Conflicting state") {
    super(409, "CONFLICT", message);
  }
}
