export class MerchantAlreadyExistsError extends Error {
  constructor(name: string) {
    super(`merchant "${name}" already exists`);
    this.name = 'MerchantAlreadyExistsError';
  }
}

export class RepositoryConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RepositoryConflictError';
  }
}

export class RepositoryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RepositoryValidationError';
  }
}
