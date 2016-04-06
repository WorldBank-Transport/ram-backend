 var OSRM = require('osrm'),
    async = require('async'),
    os = require('os'),
    fs = require('fs'),
    intersect = require('turf-intersect'),
    within = require('turf-within'),
	point = require('turf-point'),
	buffer = require('turf-buffer'),
	featurecollection = require('turf-featurecollection');

var POIs = {};
var villages;
var cpus = os.cpus().length;
process.env.UV_THREADPOOL_SIZE=Math.floor(cpus*1.5);

process.on('message', function(e) {
	process.send({type:'status',data:'started'});
	var POIfiles = e.POIs;
	var osrm = new OSRM(e.osrm);
	for (key in POIfiles) {
		POIs[key] = JSON.parse(fs.readFileSync(POIfiles[key],'utf8'));
	}
	villages = JSON.parse(fs.readFileSync(e.villages, 'utf8'));
	process.send({type:'status',data:'loaded all files'});
	var squares = e.squares;
	var data = e.data;

	var tasks = squares.map(function createTask(square,squareIdx){
		//clip the square with the input geometry
		var area = intersect(data.feature,square);
					
		return function task(callback) {
			if(area===undefined) {
				process.send({type:'square'});
				callback(null,[]);
			}
			else {
				var workingSet = villagesInRegion(area,villages);
				if(workingSet.features.length === 0) {
					process.send({type:'square'});
					callback(null,[]);
				}
				else {
					var poilist = [];
					//create a list of nearby POIs for each type
					for(key in POIs) {
						var poiset={features:[]};
						var buffertime = data.maxTime;
						while(poiset.features.length ==0) {
						//  console.log('buffertime for poi: '+buffertime)
						  poiset= poisInBuffer(area,buffertime,data.maxSpeed,POIs[key]);
						  buffertime = buffertime+900;
						}
						buffertime -= 900;
						//socket.emit('status',{id:data.id,msg:'poiset for ' + key + ' is '+poiset.features.length + ' buffer is '+buffertime});
						poilist.push({type:key,feature:poiset});
					}

					//create a list of villages
					var taskID = squareIdx;
					var newIdx = 0;
					var subtasks = poilist.map(function createSubTask(poiitem){
						return function subtask(subcallback) {
							var results = [];

					        var sources = workingSet.features.map(function(feat) {
					            return [feat.geometry.coordinates[1], feat.geometry.coordinates[0]]
					        });
					        var destinations = poiitem.feature.features.map(function(feat) {
					            return [feat.geometry.coordinates[1], feat.geometry.coordinates[0]]
					        });
					        if(sources.length ===0) throw('no sources');
					        //There might be 0 destinations in the given area, osrm will trip over this, so we'll say it's infinity
					        if(destinations.length == 0) {
					            console.log('infinity');
					            var empty = workingSet.features.map(function(f){return {eta:Infinity}});
					            return subcallback(null,{poi:poiitem.type,list:empty} );
					        }
					        else {
					            osrm.table({
					                    destinations: destinations,
					                    sources: sources
					                }, function(err, res) {
					                    if (err) {
					                    	process.send({type:'status',data:'error'});
					                        console.log(err);
					                        return subcallback(err);
					                    }

					                    if (res.distance_table &&
					                        res.distance_table[0] && res.source_coordinates &&
					                        res.distance_table[0].length == res.destination_coordinates.length) {
					                        res.distance_table.forEach(function(time, idx) {
					                            results.push({
					                                eta: time.reduce(function(prev,cur){return Math.min(prev,cur)},Infinity) / 10 //the result is in tenth of a second                                    
					                            });
					                        });
					                    }
					                    return subcallback(null,{poi:poiitem.type,list:results} );
					                }
					            );
					        }
						}
					});
					//In series, because the main async will keep track of the threadpool and adding parallel tasks here overloads it.
					async.series(subtasks,function(err,subresult){
						var submatrix = [];
						subresult.forEach(function(item){
		    				var key = item.poi;
		    				item.list.forEach(function(listitem,idx){
		    					workingSet.features[idx].properties[key] = listitem.eta;
		    				})
		    			})
						properties = workingSet.features.map(function (f) {
		                    f.properties.lat = f.geometry.coordinates[1];
		                    f.properties.lon = f.geometry.coordinates[0];
		                    return f.properties
		                });
						properties.forEach(function(property){
							submatrix.push(property);
						})
						process.send({type:'square'});
						callback(null,submatrix);
					})
				}
			}
		}
	})
	async.parallelLimit(tasks,cpus,function(err, allresults){
		console.log('done');
		process.send({type:'done',data:allresults});
	});

})

//helper function to retrieve the villages within the given region
function villagesInRegion(region,villages) {
	var fc = featurecollection([region]);
	var result = within(villages,fc);
	return result;
}

//helper function to retrieve pois of type 'poi' within a buffer around region
function poisInBuffer(feature,time,speed,poi) {
	var length = (time/3600)*speed;
	var geom = featurecollection([buffer(feature,length,'kilometers')]);
	var result = within(poi,geom);
	return result;
}
