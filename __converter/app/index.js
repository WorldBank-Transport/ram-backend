'use strict';
import path from 'path';
import { exec, fork } from 'child_process';

import { writeFile, getJSONFileContents } from './s3/utils';
import db from './db';

const WORK_DIR = path.resolve(__dirname, '../conversion');
const { PROJECT_ID: projId, SCENARIO_ID: scId } = process.env;

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
        feature: adminArea.features.find(o => o.properties.name === 'Tobias Barreto'),
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









var envelope = require('@turf/envelope');
var squareGrid = require('@turf/square-grid');




function createTimeMatrix (data, osrm) {
  console.log('Location of OSRM: ', osrm);
  var cETA = fork(path.resolve(__dirname, 'calculateETA.js'));

  var beginTime = new Date().getTime();

  // if(!data||!data.feature) {
  //   console.warn('no data');
  //   return false;
  // }
  // data.maxTime = data.maxTime || c.maxTime;
  // data.maxSpeed = data.maxSpeed || c.maxSpeed;

  // split the input region in squares for parallelisation
  var box = envelope(data.feature);
  var extent = [box.geometry.coordinates[0][0][0], box.geometry.coordinates[0][0][1], box.geometry.coordinates[0][2][0], box.geometry.coordinates[0][2][1]];
  var squares = squareGrid(extent, 30, 'kilometers');

  // tell the client how many squares there are

  cETA.send({
    data: data,
    squares: squares.features,
    villages: data.villages,
    POIs: data.pois,
    osrm: osrm,

    id: 2,
    project: data.project
  });

  var remaining = squares.features.length;

  cETA.on('message', function (msg) {
    console.log('msg', msg);
    return;



    if(msg.type == 'status') {
      io.emit('status',{id:msg.id,msg:msg.data});
    }
    else if(msg.type=='square') {
      remaining--;
      io.emit('status',{id:msg.id,msg:'srv_remaining_squares',p0:remaining});
    }
    else if(msg.type =='done') {
      //we are done, save as csv and send the filename
      var calculationTime = (new Date().getTime()-beginTime)/1000;
      var timing = Math.round(calculationTime);
      if(calculationTime>60) {
        timing = Math.round(calculationTime/60);
        io.emit('status',{id:msg.id,msg:'srv_calculated_in_m',p0:timing});

      }
      else {
        io.emit('status',{id:msg.id,msg:'srv_calculated_in_s',p0:timing});

      }
      console.log('timing: '+timing);
      io.emit('status',{id:msg.id,msg:'srv_writing'});
      var networkfile = msg.osrm.split('/')[msg.osrm.split('/').length-1];
      var osrmfile = networkfile.split('.')[0];
      var print = d3.csv.format(msg.data);
      var subfile = data.geometryId+'-'+msg.id+'-'+osrmfile;
      var file = subfile+'.csv';
      var fullpath = './web/data/'+data.project+'/csv/';
      var meta = {
        'created':{
          'time':new Date().getTime(),
          'user':credentials.user
        },
        'name':subfile,
        'csvfile':file
      };
      var metafile = fullpath+subfile+'.json';
      fs.writeFile(metafile,JSON.stringify(meta),function(err){
        if(err) return console.log(err);
        io.emit('csvMetaFinished',{id:msg.id,project:data.project});
      });
      fs.writeFile(fullpath+file, print, function(err){
        if(err) {
          return console.log(err);
        }
        io.emit('status',{id:msg.id,msg:'srv_finished',project:data.project});
        io.emit('csvFinished',{id:msg.id,project:data.project});
        cETA.disconnect();
      });
    }
  });
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
