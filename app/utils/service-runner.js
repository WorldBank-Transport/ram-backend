import EventEmitter from 'events';
import { fork } from 'child_process';
import path from 'path';

export default class ServiceRunner extends EventEmitter {
  constructor (name, data) {
    super();
    this.name = name;
    this.data = data || {};
  }

  start () {
    let servicePath = path.resolve(__dirname, `../services/${this.name}/index.js`);
    let p = fork(servicePath);
    let processError = null;

    p.on('message', function (msg) {
      switch (msg.type) {
        case 'error':
          processError = msg;
          break;
      }
      this.emit('message', msg);
    });

    p.on('exit', (code) => {
      if (code !== 0) {
        processError = processError || `Unknown error. Code ${code}`;
        this.emit('complete', new Error(processError));
      } else {
        this.emit('complete');
      }
    });

    p.send(this.data);
  }
}
