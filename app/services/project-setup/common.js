'use strict';
import Promise from 'bluebird';
import EventEmitter from 'events';

/**
 * Special emitter that tracks the events that already happened and resolves
 * then immediately if that's the case. Basically it listens to the past and
 * to the future.
 */
export class ProjectEventEmitter extends EventEmitter {
  constructor () {
    super();
    this.emitted = {};
  }

  /**
   * Overrides the emit method to store the events emitted and their results.
   */
  emit (...args) {
    // Store the results of emitted events.
    const [event, ...results] = args;
    this.emitted[event] = results;
    super.emit(...args);
  }

  /**
   * Resolves a promise once all the events fired once.
   * The promise is resolved with an object keyed by the event name containing
   * the result of each event.
   * As soon as the method is called, it checks if the events were already emitted
   * and if so, resolves them immediately preventing "waiting for Godot"
   *
   * @example
   *  waitForEvents('event1', 'event2')
   *  {
   *    'event1': result,
   *    'event2': result2
   *  }
   *
   * Note:
   * The event listeners are removed once triggered but non triggered events
   * will presist, possibly causing unwanted side effects. If there's no need
   * to wait for events anymore, they have to be removed manually.
   *
   * Note2:
   * For the scope of this script the above is not an issue because all the
   * events are cleared once the process exits (on error or success), therefore
   * there's no risk that lingering events contaminate different executions.
   *
   * @param {string} events Events to listen for
   *
   * @returns promise
   */
  async waitForEvents (...events) {
    return new Promise((resolve) => {
      let completed = 0;
      let results = {};
      events.forEach(e => {
        // Was the event emitted already?
        if (this.emitted[e]) {
          results[e] = this.emitted[e];
          if (++completed === events.length) resolve(results);
        } else {
          this.once(e, (result = null) => {
            results[e] = result;
            if (++completed === events.length) resolve(results);
          });
        }
      });
    });
  }
}
