'use strict';
import nodeUtils from 'util';

export function ExtendableError (message, extra) {
  Error.captureStackTrace && Error.captureStackTrace(this, this.constructor);
  this.name = this.constructor.name;
  this.message = message;
  this.extra = extra;
}
nodeUtils.inherits(ExtendableError, Error);

// Error definition.

export function ProjectNotFoundError (message, extra) {}
nodeUtils.inherits(ProjectNotFoundError, ExtendableError);

export function ScenarioNotFoundError (message, extra) {}
nodeUtils.inherits(ScenarioNotFoundError, ExtendableError);

export function FileExistsError (message, extra) {}
nodeUtils.inherits(FileExistsError, ExtendableError);
