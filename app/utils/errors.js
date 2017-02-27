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

export function ProjectNotFoundError (message = 'Project not found', extra) {}
nodeUtils.inherits(ProjectNotFoundError, ExtendableError);

export function ScenarioNotFoundError (message = 'Scenario not found', extra) {}
nodeUtils.inherits(ScenarioNotFoundError, ExtendableError);

export function FileExistsError (message = 'File already exists', extra) {}
nodeUtils.inherits(FileExistsError, ExtendableError);

export function FileNotFoundError (message = 'File not found', extra) {}
nodeUtils.inherits(FileNotFoundError, ExtendableError);

export function ProjectStatusError (message, extra) {}
nodeUtils.inherits(ProjectStatusError, ExtendableError);
