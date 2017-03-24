'use strict';
import path from 'path';
import { exec, fork } from 'child_process';

import { writeFile, getJSONFileContents } from './s3/utils';
import db from './db';

const WORK_DIR = path.resolve(__dirname, '../conversion');
const { PROJECT_ID: projId, SCENARIO_ID: scId } = process.env;


import Operation from './utils/operation';

new Operation();

process.exit(0)



// Include the project Id and scenario is in the file name, before the
// extension. profile.lua => profile--p1s1.lua
const f = (name) => {
  let pieces = name.split('.');
  return `${pieces[0]}--p${projId}s${scId}.${pieces[1]}`;
};

Promise.all([
  db('projects_files')
    .select('*')
    .where('project_id', projId),
  db('scenarios_files')
    .select('*')
    .where('project_id', projId)
    .where('scenario_id', scId)
])
// Convert the files array into an object indexed by type.
.then(files => {
  let obj = {};
  files
    .reduce((acc, f) => acc.concat(f), [])
    .forEach(o => (obj[o.type] = o));
  return obj;
})
// Loaded needed files and write the others to disk to be used by
// osm2osrm for the conversion.
.then(files => Promise.all([
  getJSONFileContents(files['admin-bounds'].path),
  getJSONFileContents(files.villages.path),
  getJSONFileContents(files.poi.path),
  writeFile(files.profile.path, `${WORK_DIR}/profile.lua`),
  writeFile(files['road-network'].path, `${WORK_DIR}/road-network.osm`)
]))
.then(res => {
  let [adminArea, villages, pois] = res;

  // return osm2osrm(WORK_DIR)
  //   .then(() => osm2osrmCleanup(WORK_DIR))
  //   .then(() => {
      var data = {
        adminArea: adminArea.features.find(o => o.properties.name === 'Tobias Barreto'),
        villages: villages,
        pois: {
          townhall: pois
        },
        maxSpeed: 120,
        maxTime: 3600
      };

      createTimeMatrix(data, `${WORK_DIR}/road-network.osrm`);

    // })
})
// .then(() => {

// })
// .then(() => process.exit(0))
.catch(err => {
  console.log('err', err);
  process.exit(1);
});


function osm2osrm (dir) {
  return new Promise((resolve, reject) => {
    let bin = path.resolve(__dirname, '../scripts/osm2osrm.sh');
    exec(`bash ${bin} -d ${dir}`, (error, stdout, stderr) => {
      if (error) return reject(stderr);
      return resolve(stdout);
    });
  });
}

function osm2osrmCleanup (dir) {
  return new Promise((resolve, reject) => {
    let globs = [
      'road-network.osm',
      // 'road-network.osrm.*',
      'stxxl*',
      'profile.lua'
    ].map(g => `${dir}/${g}`).join(' ');

    exec(`rm ${globs}`, (error, stdout, stderr) => {
      if (error) return reject(stderr);
      return resolve(stdout);
    });
  });
}










import fs from 'fs';


function createTimeMatrix (data, osrm) {
  let beginTime = Date.now();

  let processData = {
    id: 2,
    poi: data.pois,
    gridSize: 30,
    villages: data.villages,
    osrmFile: osrm,
    maxTime: data.maxTime,
    maxSpeed: data.maxSpeed,
    adminArea: data.adminArea
  };
  let remainingSquares = null;

  const cETA = fork(path.resolve(__dirname, 'calculateETA.js'));
  cETA.send(processData);
  cETA.on('message', function (msg) {
    console.log('msg', msg);

    switch (msg.type) {
      case 'squarecount':
        remainingSquares = msg.data;
        break;
      case 'square':
        remainingSquares--;
        // Emit status?
        break;
      case 'done':
        let calculationTime = (Date.now() - beginTime) / 1000;
        console.log('calculationTime', calculationTime);
        // Build csv file.
        let data = msg.data;
        let header = Object.keys(data[0]);
        // Ensure the row order is the same as the header.
        let rows = data.map(r => header.map(h => r[h]));

        // Convert to string
        let file = header.join(',') + '\n';
        file += rows.map(r => r.join(',')).join('\n');

        fs.writeFileSync('results', file);

        cETA.disconnect();
        process.exit(0);
        break;
    }
  });

  cETA.on('exit', (code) => {
    console.log('exit', code);
  });
}


function processResult (data) {
  // Build csv file.
  console.log('data', data);

  // var networkfile = msg.osrm.split('/')[msg.osrm.split('/').length-1];
  // var osrmfile = networkfile.split('.')[0];
  // var print = d3.csv.format(msg.data);
  // var subfile = data.geometryId+'-'+msg.id+'-'+osrmfile;
  // var file = subfile+'.csv';
  // var fullpath = './web/data/'+data.project+'/csv/';
  // var meta = {
  //   'created':{
  //     'time':new Date().getTime(),
  //     'user':credentials.user
  //   },
  //   'name':subfile,
  //   'csvfile':file
  // };
  // var metafile = fullpath+subfile+'.json';
  // fs.writeFile(metafile,JSON.stringify(meta),function(err){
  //   if(err) return console.log(err);
  //   io.emit('csvMetaFinished',{id:msg.id,project:data.project});
  // });
  // fs.writeFile(fullpath+file, print, function(err){
  //   if(err) {
  //     return console.log(err);
  //   }
  //   io.emit('status',{id:msg.id,msg:'srv_finished',project:data.project});
  //   io.emit('csvFinished',{id:msg.id,project:data.project});
  //   cETA.disconnect();
  // });
}
















// const CODE_PROCESS_ZONE = 1;
// const CODE_AGGREGATE = 2;

// const db = knex({
//   client: 'pg',
//   connection: process.env.DB_URI
// });

// db('conversions')
//   .returning('*')
//   .insert({
//     project_id: 1200,
//     scenario_id: 1200,
//     status: 'processing',
//     created_at: (new Date()),
//     updated_at: (new Date())
//   })
//   .then(res => {
//     console.log('Start...');
//     start(res[0].id);
//   })
//   .catch(err => {
//     console.log('err', err);
//     process.exit(1);
//   });

// function start (conversionId) {
//   let count = 0;
//   let iterations = 10;

//   const processor = () => {
//     db('conversions_logs')
//       .insert({
//         conversion_id: conversionId,
//         code: CODE_PROCESS_ZONE,
//         data: JSON.stringify({zone: count}),
//         created_at: (new Date())
//       })
//       .then(() => {
//         console.log('Doing something', count);
//         if (++count < iterations) {
//           setTimeout(processor, 1000);
//         } else {
//           aggregate(conversionId);
//         }
//       });
//   };
//   processor();
// }

// function aggregate (conversionId) {
//   db('conversions_logs')
//     .insert({
//       conversion_id: conversionId,
//       code: CODE_AGGREGATE,
//       created_at: (new Date())
//     })
//     .then(() => db('conversions')
//       .update({
//         status: 'finished',
//         updated_at: (new Date())
//       })
//       .where('id', conversionId)
//     )
//     .then(() => {
//       console.log('done');
//       process.exit(0);
//     });
// }
