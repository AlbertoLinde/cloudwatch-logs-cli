export class AWSError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AWSError';
  }
}
