import EventEmitter from 'events';
import { fork } from 'child_process';
import path from 'path';

export default class ServiceRunner extends EventEmitter {
  constructor (name, data) {
    super();
    this.name = name;
    this.data = data || {};
    this.running = false;
    this.killed = false;
    this.theProcess = null;
  }

  start () {
    // Set an unused port number.
    // process.execArgv.push('--debug=' + (12345));
    // process.execArgv.push('--inspect');
    // Ensure the process can allocate the needed ram.
    process.execArgv.push('--max_old_space_size=4096');
    let servicePath = path.resolve(__dirname, `../services/${this.name}/index.js`);
    this.theProcess = fork(servicePath);
    let processError = null;

    this.theProcess.on('message', function (msg) {
      switch (msg.type) {
        case 'error':
          processError = msg;
          break;
      }
      this.emit('message', msg);
    });

    this.theProcess.on('exit', (code) => {
      this.running = false;
      if (code !== 0) {
        processError = processError || `Unknown error. Code ${code}`;
        if (this.killed) {
          processError = 'Process manually terminated';
        } else if (code === null) {
          // When code is null the process was terminated. It didn't exit on
          // its own.
          // Very likely to be out of memory error.
          processError = 'Process terminated by system';
        }
        this.emit('complete', new Error(processError));
      } else {
        this.emit('complete');
      }
    });

    this.theProcess.send(this.data);
    this.running = true;
  }

  kill () {
    if (this.running && this.theProcess) {
      this.running = false;
      this.killed = true;
      this.theProcess.kill();
    }
  }
}
