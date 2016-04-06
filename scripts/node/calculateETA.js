 var OSRM = require('osrm'),
    async = require('async'),
    os = require('os'),
    fs = require('fs'),
    turf = require('turf'),
    within = require('turf-within'),
	point = require('turf-point'),
	buffer = require('turf-buffer'),
	featurecollection = require('turf-featurecollection');


var POIs = {}
POIs.hospitals = JSON.parse(fs.readFileSync('./data/POIs/hospitals.geojson','utf8'));
POIs.schools = JSON.parse(fs.readFileSync('./data/POIs/schools.geojson','utf8'));
POIs.banks = JSON.parse(fs.readFileSync('./data/POIs/banks.geojson','utf8'));
POIs.counties = JSON.parse(fs.readFileSync('./data/POIs/counties.geojson','utf8'));
POIs.prefectures = JSON.parse(fs.readFileSync('./data/POIs/prefectures.geojson','utf8'));

var villages = JSON.parse(fs.readFileSync('./data/ReadytoUse/Village_pop.geojson', 'utf8'));

var cpus = os.cpus().length;
process.env.UV_THREADPOOL_SIZE=Math.floor(cpus*1.5);
var osrm = new OSRM('./data/OSRM-ready/map.osrm');

process.on('message', function(e) {
	process.send({type:'status',data:'started'});
	console.log('incoming msg');
	var squares = e.squares;
	var data = e.data;

	var tasks = squares.map(function createTask(square,squareIdx){
		//clip the square with the input geometry
		var area = turf.intersect(data.feature,square);
					
		return function task(callback) {
			if(area===undefined) {
				process.send({type:'square'});
				callback(null,[]);
			}
			else {
				var workingSet = villagesInRegion(area);
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
					
					console.log(workingSet.features.length);
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
					        if(sources.length ===0 || destinations.length ==0)
					        	throw('no sources/destinations')
					        //There might be 0 destinations in the given area, osrm will trip over this, so we'll say it's infinity
					        if(destinations.length == 0) {
					            console.log('infinity');
					            var empty = workingSet.features.map(function(f){return {eta:Infinity}});
					            return subcallback(null,{poi:poiitem.type,list:empty} )
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
					                    return subcallback(null,{poi:poiitem.type,list:results} )
					                }
					            );
					        }
						}
					});
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
		                    return f.properties});
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
function villagesInRegion(region) {
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
