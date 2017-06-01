'use strict';
import ExtendableError from 'es6-error';

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
