'use strict';
import ExtendableError from 'es6-error';
import Boom from 'boom';

export class ProjectNotFoundError extends ExtendableError {
  constructor (message = 'Project not found', extra) {
    super(message);
    this.extra = extra;
  }
}

export class ScenarioNotFoundError extends ExtendableError {
  constructor (message = 'Scenario not found', extra) {
    super(message);
    this.extra = extra;
  }
}

export class FileNotFoundError extends ExtendableError {
  constructor (message = 'File not found', extra) {
    super(message);
    this.extra = extra;
  }
}

export class FileExistsError extends ExtendableError {
  constructor (message = 'File already exists', extra) {
    super(message);
    this.extra = extra;
  }
}

export class ProjectStatusError extends ExtendableError {
  constructor (message, extra) {
    super(message);
    this.extra = extra;
  }
}

export class DataConflictError extends ExtendableError {
  constructor (message, extra) {
    super(message);
    this.extra = extra;
  }
}

export class MasterScenarioError extends ExtendableError {
  constructor (message, extra) {
    super(message);
    this.extra = extra;
  }
}

export class DataValidationError extends ExtendableError {
  constructor (message, extra) {
    super(message);
    this.extra = extra;
  }
}

export class DisabledServiceError extends ExtendableError {
  constructor (message, extra) {
    super(message);
    this.extra = extra;
  }
}

/**
 * Gets the appropriate Boom response for the given error. Can be passed
 * directly to the reply interface.
 * This function is specially useful when workin with try/catch blocks that can
 * throw multiple errors.
 *
 * @param {Error} error Error object
 *
 * @returns Boom response
 */
export function getBoomResponseForError (error) {
  // Check for known error types.
  if (error instanceof FileNotFoundError) return Boom.notFound(error.message);
  if (error instanceof FileExistsError) return Boom.conflict(error.message);
  if (error instanceof ProjectNotFoundError) return Boom.notFound(error.message);
  if (error instanceof ScenarioNotFoundError) return Boom.notFound(error.message);
  if (error instanceof MasterScenarioError) return Boom.conflict(error.message);
  if (error instanceof ProjectStatusError) return Boom.badRequest(error.message);
  if (error instanceof DataConflictError) return Boom.conflict(error.message);
  if (error instanceof DataValidationError) return Boom.badRequest(error.message);

  // Check for known error codes.
  if (error.code === 'NoSuchKey') return Boom.notFound('File not found in storage bucket');

  // Default handling.
  console.log('error', error);
  return Boom.badImplementation(error);
}
