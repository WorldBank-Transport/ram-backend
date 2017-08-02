'use strict';
import fs from 'fs';

export default function AppLogger (options) {
  options = Object.assign({}, {
    output: false
  }, options);

  let chrono = [];
  let history = {
    main: []
  };

  let lastTime = null;

  const getTimeDiff = () => {
    let prev = lastTime;
    lastTime = Date.now();
    if (!prev) {
      return '--';
    } else {
      let diff = (lastTime - prev) / 1000;
      return `+${diff}`;
    }
  };

  const getLogTime = () => {
    let d = new Date();
    let h = d.getHours();
    h = h < 10 ? `0${h}` : h;
    let m = d.getMinutes();
    m = m < 10 ? `0${m}` : m;
    let s = d.getSeconds();
    s = s < 10 ? `0${s}` : s;
    let ml = d.getMilliseconds();
    ml = ml < 10 ? `00${ml}` : ml < 100 ? `0${ml}` : ml;
    return `${h}:${m}:${s}.${ml}`;
  };

  const _log = (group, ...args) => {
    if (!history[group]) history[group] = [];
    let t = getLogTime();
    let d = getTimeDiff();
    history[group].push([`[${t} ${d}]`, ...args]);
    chrono.push([`[${t} ${d}]`, `[${group}]`, ...args]);
    options.output && console.log(`[${t} ${d}]`, `[${group}]`, ...args);
  };

  const _dump = (group) => {
    options.output && console.log('--- --- ---');
    options.output && console.log(`[${group}]`);
    options.output && history[group].forEach(o => console.log(...o));
    options.output && console.log('--- --- ---');
  };

  return {
    getLogTime,
    group: (name) => ({
      getLogTime,
      log: (...args) => _log(name, ...args),
      dump: () => _dump(name)
    }),
    log: (...args) => _log('main', ...args),
    dump: () => {
      options.output && chrono.forEach(o => console.log(...o));
    },
    dumpGroups: () => {
      Object.keys(history).forEach(g => _dump(g));
    },
    toFile: (path) => {
      let data = chrono.map(o => o.join(' ')).join('\n');
      fs.writeFileSync(path, data);
    }
  };
}
