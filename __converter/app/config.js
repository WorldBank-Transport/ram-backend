'use strict';
import os from 'os';
const cpus = os.cpus().length;

export default {
  cpus: Math.floor(cpus * 1.5),
  debug: true
};
