'use strict';
import Promise from 'bluebird';

/**
 * Resolves a promise once all the events fired once.
 * The promise is resolved with an object keyed by the event name containing
 * the result of each event.
 * @example
 *  waitForEventsOnEmitter(emitter, 'event1', 'event2')
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
 * For the scope of this script the above is not an isseu because all the
 * events are cleared once the process exits (on error or success), therefore
 * there's no risk that lingering events contaminate different executions.
 *
 * @param {object} emitter EventEmitter intance
 * @param {string} events Events to listen for
 *
 * @returns promise
 */
export async function waitForEventsOnEmitter (emitter, ...events) {
  return new Promise((resolve) => {
    let completed = 0;
    let results = {};
    events.forEach(e => emitter.once(e, (result = null) => {
      results[e] = result;
      if (++completed === events.length) resolve(results);
    }));
  });
}
