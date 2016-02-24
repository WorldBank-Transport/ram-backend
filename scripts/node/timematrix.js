var app = require('http').createServer(handler),
	io = require('socket.io')(app),
	fs = require('fs'),
	within = require('turf-within'),
	point = require('turf-point'),
	buffer = require('turf-buffer'),
	featurecollection = require('turf-featurecollection'),
    OSRM = require('osrm'),
    Isochrone = require('osrm-isochrone'),
    d3 = require('d3');

/* local file */
var NearestPoi = require('./nearestpoi.js');

/*###############################################################################

CONFIGURATION

POIs: For each GeoJSON with points of interest (POI), add an attribute to POIs
and point it to the geojson on disk

villages: point to the geojson containing the centerpoint of the villages

network: point to the absolute location of the osrm file of the road network

maxSpeed: the speed that will be used to define the size of the buffer around polygons
in which to look for POIs (by multiplying the maxTime and maxSpeed)
(typically 120km/h)

maxTime: the cutoff time for the matrix: everything above that time might not be accurate
(typically 3600s (==1 hour))

*/

var POIs = {}
POIs.hospitals = JSON.parse(fs.readFileSync('../../data/POIs/hospitals.geojson','utf8'));
POIs.schools = JSON.parse(fs.readFileSync('../../data/POIs/schools.geojson','utf8'));
POIs.banks = JSON.parse(fs.readFileSync('../../data/POIs/banks.geojson','utf8'));
POIs.counties = JSON.parse(fs.readFileSync('../../data/POIs/counties.geojson','utf8'));
POIs.prefectures = JSON.parse(fs.readFileSync('../../data/POIs/prefectures.geojson','utf8'));

var villages = JSON.parse(fs.readFileSync('../../data/ReadytoUse/Village_pop.geojson', 'utf8'));

var network = '../../data/OSRM-ready/map.osrm';

var maxSpeed = 120,
	maxTime = 1200;

app.listen(5000);

function handler(req, res) {
	res.writeHead(200);
	res.end("{connected:true}");
}

io.on('connection',function (socket) {
	socket.emit('status', {socketIsUp: true});
	socket.on('debug',function(data){console.log(data)});

	socket.on('getisochrone', createIsochrone);
	socket.on('getStatsForRegion',createStats);

	function createIsochrone(data) {
		if(!data||!data.center) {
			console.warn('no data')
			return false;
		}

		socket.emit('status',{id:data.id,msg:'creating isochrone'})

		var workingSet =villagesInCircle(data.center,data.time,maxSpeed);

		socket.emit('status',{id:data.id,msg:'workingset for the isochrone is '+workingSet.features.length})
		var options = {
			resolution: data.res,
			maxspeed: maxSpeed,
			unit: 'kilometers',
			network: network,
			destinations: workingSet,
			socket: socket,
			id:data.id
		}
		var isochrone = new Isochrone(data.center,data.time,options,function(err,features){
			socket.emit('finished',{type:'isochrone',data:features})
		})
		isochrone.getIsochrone();
	}

	function createStats(data) {
		if(!data||!data.feature) {
			console.warn('no data')
			return false;
		}
		socket.emit('status',{id:data.id,msg:'creating statistics'})

		var result = [],
		    poilist = [],
		    geometryId = data.geometryId,
		    workingSet = villagesInRegion(data.feature);

		socket.emit('status',{id:data.id,msg:'workingset is '+workingSet.features.length});

		for(key in POIs) {
			var poiset={features:[]};
			var buffertime = data.time;
			while(poiset.features.length ==0) {
			  console.log('buffertime for poi: '+buffertime)
			  poiset= poisInBuffer(data.feature,buffertime,data.maxSpeed,POIs[key]);
			  buffertime = buffertime+900;
			}
			buffertime -= 900;
			socket.emit('status',{id:data.id,msg:'poiset for ' + key + ' is '+poiset.features.length + ' buffer id '+buffertime});
			poilist.push({type:key,feature:poiset});
		}

		var options = {
			network: network,
			socket: socket,
			id:data.id
		}
		function createMatrix(index) {
			console.log(poilist[index].type);
			var nearestPoi = new NearestPoi(workingSet,poilist[index].feature,options,function (err,list) {
				socket.emit('status',{id:data.id,msg:'matrix for ' + poilist[index].type + ' is done'});
				result.push({poi:poilist[index].type,list:list})
				//next item in the POIs object
				if(index<poilist.length-1) {
					newIdx = index +1;
					createMatrix(newIdx);
				}
				else {
        			result.forEach(function(item){
        				var key = item.poi;
        				item.list.forEach(function(listitem,idx){
        					workingSet.features[idx].properties[key] = listitem.eta;
        				})
        			})
					var properties = workingSet.features.map(function (f) {
                        f.properties.lat = f.geometry.coordinates[1];
                        f.properties.lon = f.geometry.coordinates[0];
                        return f.properties});
					var print = d3.csv.format(properties);
                    var file = '../../data/'+geometryId+'-'+data.id+'.csv';
                    fs.writeFile(file, print, function(err){
                        if(err) {
                            return console.log(err);
                        }
                        socket.emit('finished',{type:'poilist',file:file,geometryId:geometryId});
                    });
				}
			})
			socket.emit('status',{id:data.id,msg:'matrix calculation for ' + poilist[index].type + ' is started'});
			nearestPoi.getList();
		}
		//Start calculating matrices
		createMatrix(0);
	}
})

//helper function to retrieve the villages within maxSpeed*maxTime radius
function villagesInCircle(center,time,speed) {
	var centerPt = point([center[0],center[1]]);
	var length = (time/3600)*speed;
	var circle = buffer(centerPt,length,'kilometers');
	var result = within(villages,circle);
	return result;
}

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
	console.log(result.features.length+ ' pois within time');
	return result;
}
