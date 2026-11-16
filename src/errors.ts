/** Error that is safe to show to API clients. Anything else is treated as a 500. */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const validationError = (message: string, details?: unknown) =>
  new AppError(400, 'VALIDATION_ERROR', message, details);

export const notFoundError = (message: string) => new AppError(404, 'NOT_FOUND', message);

/** The request is well formed but breaks a business rule (e.g. weights do not add up to 100). */
export const businessRuleError = (message: string, details?: unknown) =>
  new AppError(422, 'BUSINESS_RULE_VIOLATION', message, details);
