'use strict';
import nodeUtils from 'util';

export function ProjectNotFoundError (message = 'Project not found', extra) {
  Error.captureStackTrace && Error.captureStackTrace(this, this.constructor);
  this.name = this.constructor.name;
  this.message = message;
  this.extra = extra;
}
nodeUtils.inherits(ProjectNotFoundError, Error);

export function ScenarioNotFoundError (message = 'Scenario not found', extra) {
  Error.captureStackTrace && Error.captureStackTrace(this, this.constructor);
  this.name = this.constructor.name;
  this.message = message;
  this.extra = extra;
}
nodeUtils.inherits(ScenarioNotFoundError, Error);

export function FileNotFoundError (message = 'File not found', extra) {
  Error.captureStackTrace && Error.captureStackTrace(this, this.constructor);
  this.name = this.constructor.name;
  this.message = message;
  this.extra = extra;
}
nodeUtils.inherits(FileNotFoundError, Error);

export function FileExistsError (message = 'File already exists', extra) {
  Error.captureStackTrace && Error.captureStackTrace(this, this.constructor);
  this.name = this.constructor.name;
  this.message = message;
  this.extra = extra;
}
nodeUtils.inherits(FileExistsError, Error);

export function ProjectStatusError (message, extra) {
  Error.captureStackTrace && Error.captureStackTrace(this, this.constructor);
  this.name = this.constructor.name;
  this.message = message;
  this.extra = extra;
}
nodeUtils.inherits(ProjectStatusError, Error);
