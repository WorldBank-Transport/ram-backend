var OSRM = require('osrm');
var async = require('async');
var os = require('os');
var fs = require('fs');
var turf = require('@turf/turf');

import { point, featureCollection, intersect, within, buffer } from '@turf/turf';

var POIs = {};
var villages;
var cpus = os.cpus().length;
process.env.UV_THREADPOOL_SIZE = Math.floor(cpus * 1.5);

/**
 * Get all villages in the given area.
 * @param  {Feature} area
 * @param  {FeatureCollection} villages
 * @return {FeatureCollection}
 *   Villages in the given area
 */
function villagesInRegion (area, villages) {
  let result = within(villages, featureCollection([area]));
  console.log('villages in batch', result.features.length);
  return result;
}

/**
 * Get the poi within a buffer around area.
 * The buffer distance is calculated based of the kilometers traveled at {speed}
 * during {time} seconds.
 * @param  {Feature} area
 * @param  {number} time    Value in seconds
 * @param  {number} speed   Value in km/h
 * @param  {FeatureCollection} poi     Points of Interest
 * @return {FeatureCollection}
 *   The Points of Interest in the buffered area.
 */
function poisInBuffer (area, poi, time, speed) {
  let distance = (time / 3600) * speed;
  let bufferedArea = buffer(area, distance, 'kilometers');
  var result = within(poi, featureCollection([bufferedArea]));
  return result;
}

process.on('message', function (e) {
  process.send({type: 'status', data: 'srv_started', id: e.id});

  POIs = e.POIs;
  villages = e.villages;
  var squares = e.squares;
  var data = e.data;
  var osrm = new OSRM(e.osrm);

  var adminArea = data.feature;
  var poiByType = e.POIs;
  process.send({type: 'status', data: 'srv_loaded_files', id: e.id});

  var squareTasks = squares.map((square, squareIdx) => {
    // Clip the square with the input geometry. In this way we work with a
    // smaller area and allow parallelisation.
    let area = intersect(adminArea, square);

    // Return a task (function to be used by async)
    return (callback) => {
      if (!area) {
        // The square doesn't intersect with the adminArea.
        // Return an empty result.
        process.send({type: 'square', id: e.id});
        return callback(null, []);
      }

      // Get the villages in the area.
      let workingSet = villagesInRegion(area, villages);
      if (workingSet.features.length === 0) {
        // There are no villages within the square.
        // Return an empty result.
      }

      let poilist = [];

      // For each POI type (banks, hospitals...) get at least 4 in the area.
      // If there are none increase the search buffer until they're found.
      // TODO: Handle case where there are never at least 4 POIs.
      for (var key in poiByType) {
        let poiSet;
        let time = data.maxTime;
        let speed = data.maxSpeed;
        do {
          poiSet = poisInBuffer(area, poiByType[key], time, speed);
          time += 900;
        } while (poiSet.features.length < 4);

        poilist.push({type: key, feature: poiSet});
      }

      // Add 'nearest' as a POI type to calculate the distance between village
      // and the nearest road
      poilist.push({type: 'nearest'});
    };
  });







  var tasks = squares.map(function createTask (square, squareIdx) {
    // Clip the square with the input geometry
    var area = intersect(data.feature, square);

    return function task (callback) {
      if (area === undefined) {
        // The square doesn't intersect with the selected region, return an empty result- square level
        process.send({type: 'square', id: e.id});
        return callback(null, []);
      } // THE END

      var workingSet = villagesInRegion(area, villages);

      // console.log("Area: "+ JSON.stringify(area))
      // console.log("Villages: "+ JSON.stringify(villages))
      // console.log("Interset: "+ JSON.stringify(workingSet))
      if(workingSet.features.length === 0) {
        //There are no villages within the square, return an empty result - square level
        console.log("No villages within batch");
        process.send({type:'square',id:e.id});
        return callback(null,[]);
      } //THE END

    console.log('workingSet', workingSet);
    process.exit(0);
      var poilist = [];
      //create a list of nearby POIs for each type
      for(var key in POIs) {
        var poiset={features:[]};
        var buffertime = data.maxTime;
        console.log('area', area);
        console.log('buffertime', buffertime);
        console.log('data.maxSpeed', data.maxSpeed);
        console.log('POIs[key]', POIs[key]);
        while(poiset.features.length <4) {
          poiset= poisInBuffer(area,buffertime,data.maxSpeed,POIs[key]);
          buffertime = buffertime+900;
        }
        buffertime -= 900;
        poilist.push({type:key,feature:poiset});
      }
      //Add 'nearest' type to calculate the distance between village and road
      poilist.push({type:'nearest'});
      console.log('poilist', poilist);


      //
      // Continue here vv

      //create a list of villages
      var taskID = squareIdx;
      var newIdx = 0;
      var subtasks = poilist.map(function createSubTask(poiitem){
        return function subtask(subcallback) {
          var results = [];
              var sources = workingSet.features.map(function(feat) {
                  return [feat.geometry.coordinates[0], feat.geometry.coordinates[1]];
              });
              //This should not happen :)
              if(sources.length ===0) throw('no sources'); //THE END

              if(poiitem.type === 'nearest') {
                //calculate distance from the village to the nearest road segment
                var neartasks = sources.map(function createNearTask(source,idx){
              return function neartask(nearcallback) {
                osrm.nearest({coordinates:[source]},
                  function(err,res){
                    if (err) throw(err);
                    var neartime = res.waypoints[0].distance;
                    //Return the nearcallback (village level callback)
                    return nearcallback(null,{sourceId:idx,time:neartime});
                });
              };
            });
            //Run the nearest tasks in series, they are pretty fast and otherwise will mess up the async.parallel set higherup
            async.series(neartasks,function(err,nearresult){
              if(err) {
                console.warn(err);
              }
              else {
                nearresult.forEach(function(nr){results[nr.sourceId] = {eta:nr.time};});
                //Return the subcallback (POI level callback)
                return subcallback(null,{poi:'nearest',list:results} );
              }
            });

              }
              else {
                //Calculate the normal POI distances
                var destinations = poiitem.feature.features.map(function(feat) {
                    return [feat.geometry.coordinates[0], feat.geometry.coordinates[1]];
                });
                //This should not happen :)
                if(destinations.length ===0) throw('no destinations'); //THE END
                /*
                //There might be 0 destinations in the given area, osrm will trip over this, so we'll say it's infinity
                if(destinations.length == 0) {
                    console.log('infinity');
                    var empty = workingSet.features.map(function(f){return {eta:-100}});
                    return subcallback(null,{poi:poiitem.type,list:empty} );
                }*/
                //OSRM v5 requires one list of coordinates and two arrays of indices
                var c = sources.concat(destinations);
                var s = sources.reduce(function(p,c){p.push(p.length);return p;},[]);
                var d = destinations.reduce(function(p,c){p.push(p.length+sources.length);return p;},[]);

                osrm.table({
                      coordinates: c,
                      destinations: d,
                      sources: s
                      }, function(err, res) {
                          if (err) {
                            process.send({type:'status',data:'error',id:e.id});
                              console.log('error:'+err);
                              //Return the error with subcallback (POI level callback)
                              return subcallback(err);
                          }
                          if (res.durations &&
                              res.durations[0] && res.sources &&
                              res.durations[0].length === res.destinations.length) {
                              res.durations.forEach(function(time, idx) {
                                  results.push({
                                      eta: time.reduce(function(prev,cur){return Math.min(prev,cur);},Infinity) //the result is in tenth of a second
                                  });
                              });
                          }
                          //Return the subcallback (POI level callback)
                          return subcallback(null,{poi:poiitem.type,list:results} );
                      }
                  );
              }
        };
      });
      //In series, because the main async will keep track of the threadpool and adding parallel tasks here overloads it.
      async.series(subtasks,function(err,subresult){
        if(err) {
          throw(err); //THE END
        }
        else {
          var submatrix = [];
          subresult.forEach(function(item){
              var key = item.poi;
              item.list.forEach(function(listitem,idx){
                workingSet.features[idx].properties[key] = listitem.eta;
              });
            });
          properties = workingSet.features.map(function (f) {
                      f.properties.lat = f.geometry.coordinates[1];
                      f.properties.lon = f.geometry.coordinates[0];
                      return f.properties;
                  });
          properties.forEach(function(property){
            submatrix.push(property);
          });
          // all poi calculations are done returning callback - square level
          process.send({type:'square',id:e.id});
          return callback(null,submatrix); //THE END
        }
      });
    };
  });
  async.parallelLimit(tasks,cpus,function(err, allresults){
    var endresult = [];
    allresults.forEach(function(ar){
      ar.forEach(function(r){
        endresult.push(r);
      });
    });
    console.log('OSRM async. Calculation done');
    process.send({type:'done',data:endresult,osrm:e.osrm,id:e.id});
  });

});
