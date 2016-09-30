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
	process.send({type:'status',data:'srv_started',id:e.id});	
	POIs = e.POIs;	
	var osrm = new OSRM(e.osrm);	
	villages = e.villages;
	process.send({type:'status',data:'srv_loaded_files',id:e.id});
	var squares = e.squares;
	var data = e.data;

	var tasks = squares.map(function createTask(square,squareIdx){
		//clip the square with the input geometry
		var area = intersect(data.feature,square);
					
		return function task(callback) {
			if(area===undefined) {
				//The square doesn't intersect with the selected region, return an empty result- square level
				process.send({type:'square',id:e.id});
				return callback(null,[]);
			} //THE END
			
			var workingSet = villagesInRegion(area,villages);
			if(workingSet.features.length === 0) {
				//There are no villages within the square, return an empty result - square level
				process.send({type:'square',id:e.id});
				return callback(null,[]);
			} //THE END
			
			var poilist = [];
			//create a list of nearby POIs for each type
			for(key in POIs) {
				var poiset={features:[]};
				var buffertime = data.maxTime;
				while(poiset.features.length <4) {
				  poiset= poisInBuffer(area,buffertime,data.maxSpeed,POIs[key]);
				  buffertime = buffertime+900;
				}
				buffertime -= 900;
				poilist.push({type:key,feature:poiset});
			}
			//Add 'nearest' type to calculate the distance between village and road
			poilist.push({type:'nearest'});
			//create a list of villages
			var taskID = squareIdx;
			var newIdx = 0;
			var subtasks = poilist.map(function createSubTask(poiitem){
				return function subtask(subcallback) {
					var results = [];
			        var sources = workingSet.features.map(function(feat) {
			            return [feat.geometry.coordinates[0], feat.geometry.coordinates[1]]
			        });
			        //This should not happen :)
			        if(sources.length ===0) throw('no sources'); //THE END

			        if(poiitem.type == 'nearest') {
			        	//calculate distance from the village to the nearest road segment
			        	var neartasks = sources.map(function createNearTask(source,idx){
							return function neartask(nearcallback) {
								osrm.nearest({coordinates:[source]},
									function(err,res){
										if (err) throw(err);
										var neartime = res.waypoints[0].distance;
										//Return the nearcallback (village level callback)
										return nearcallback(null,{sourceId:idx,time:neartime})
								})
							}
						});
						//Run the nearest tasks in series, they are pretty fast and otherwise will mess up the async.parallel set higherup
						async.series(neartasks,function(err,nearresult){
							if(err) {
								console.warn(err);
							}
							else {
								nearresult.forEach(function(nr){results[nr.sourceId] = {eta:nr.time}})
								//Return the subcallback (POI level callback)
								return subcallback(null,{poi:'nearest',list:results} );
							}
						})						
			        	
			        }
			        else {
			        	//Calculate the normal POI distances
				        var destinations = poiitem.feature.features.map(function(feat) {
				            return [feat.geometry.coordinates[0], feat.geometry.coordinates[1]]
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
			        	var s = sources.reduce(function(p,c){p.push(p.length);return p},[]);
			        	var d = destinations.reduce(function(p,c){p.push(p.length+sources.length);return p},[]);
			        	
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
			                        res.durations[0].length == res.destinations.length) {
			                        res.durations.forEach(function(time, idx) {
			                            results.push({
			                                eta: time.reduce(function(prev,cur){return Math.min(prev,cur)},Infinity) //the result is in tenth of a second                                    
			                            });
			                        });
			                    }
			                    //Return the subcallback (POI level callback)
			                    return subcallback(null,{poi:poiitem.type,list:results} );
			                }
			            );
			        }
				}
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
					// all poi calculations are done returning callback - square level
					process.send({type:'square',id:e.id});
					return callback(null,submatrix); //THE END
				}
			})
		}	
	})
	async.parallelLimit(tasks,cpus,function(err, allresults){
		var endresult = [];
		allresults.forEach(function(ar){
			ar.forEach(function(r){
				endresult.push(r);
			});
		});
		console.log('done');
		process.send({type:'done',data:endresult,osrm:e.osrm,id:e.id});
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
