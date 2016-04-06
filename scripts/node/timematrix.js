var app = require('http').createServer(handler),
	io = require('socket.io')(app),
	fs = require('fs'),
    os = require('os'),
    d3 = require('d3'),
    mkdirp = require('mkdirp'),    
    fork = require('child_process').fork,
    envelope = require('turf-envelope'),
    squareGrid = require('turf-square-grid');

/*###############################################################################

CONFIGURATION

POIs: For each GeoJSON with points of interest (POI), add an attribute to POIs
and point it to the geojson on disk

villagesFile: point to the geojson containing the centerpoint of the villages

osrm: point to the absolute location of the osrm file of the road network

dir: point to the output directory

maxSpeed: the speed that will be used to define the size of the buffer around polygons
in which to look for POIs (by multiplying the maxTime and maxSpeed)
(typically 120km/h)

maxTime: the cutoff time for the matrix: everything above that time might not be accurate
(typically 3600s (==1 hour))

*/

var POIs = {}
POIs.hospitals = './data/POIs/hospitals.geojson';
POIs.schools = './data/POIs/schools.geojson';
POIs.banks = './data/POIs/banks.geojson';
POIs.counties = './data/POIs/counties.geojson';
POIs.prefectures = './data/POIs/prefectures.geojson';

var villagesFile = './data/ReadytoUse/Village_pop.geojson';
var osrm = './data/OSRM-ready/map.osrm';
var dir = './data/csv/';

var maxSpeed = 120,
	maxTime = 3600;

app.listen(5000);

function handler(req, res) {
	res.writeHead(200);
	res.end("{connected:true}");
}

mkdirp(dir, function(err) { 
  if(err) console.log(err)
});

var villages = JSON.parse(fs.readFileSync(villagesFile, 'utf8'));

io.on('connection',function (socket) {
	var beginTime;
	socket.emit('status', {socketIsUp: true}); //tell the client it is connected

	var files = fs.readdirSync(dir);
	files.sort(function(a, b) {
       return fs.statSync(dir + a).mtime.getTime() - fs.statSync(dir + b).mtime.getTime();
    });

	io.emit('status',{csvs:files}); //send the current list of csv files

	/* triggers on the socket */
	socket.on('debug',function(data){console.log(data)}); //debug modus

	socket.on('getisochrone', createIsochrone); //create isochrones

	socket.on('getMatrixForRegion',createTimeMatrix);

});

/* create an isochrone
requires:
data.center [lon,lat]
data.id ID of the run (timestamp)
data.time int with isochrone time in seconds
data.res int with the resolution of the isochrone

returns:
isochrone features
*/
function createIsochrone(data) {
	var cISO = fork('./scripts/node/calculateIsochrone.js');
	if(!data||!data.center) {
		console.warn('no data')
		return false;
	}
	io.emit('status',{id:data.id,msg:'creating isochrones for ETAs: '+data.time})

	cISO.send({data:data,villages:villagesFile,osrm:osrm,maxSpeed:maxSpeed});
	
	cISO.on('message',function(msg){
		if(msg.type == 'error') {
			console.warn(msg.data);
		}
		else if(msg.type =='done') {
			io.emit('status',{id:data.id,msg:'finished'});
			io.emit('finished',{type:'isochrone',data:msg.data});
			cISO.disconnect();

		}
	});
}

/* create distance matrix
requires:
data.feature feature to calculate the timematrix for
data.id ID of the run (timestamp)
data.geometryID ID of the input geometry
optional:
maxTime int with the maximum time for the buffer in seconds
maxSpeed int with the maximum speed in km/h

returns:
location of CSV file
*/

function createTimeMatrix(data) {
	var cETA = fork('./scripts/node/calculateETA.js');
	beginTime = new Date().getTime();
	if(!data||!data.feature) {
		console.warn('no data')
		return false;
	}
	data.maxTime = data.maxTime || maxTime;
	data.maxSpeed = data.maxSpeed || maxSpeed;

	io.emit('status',{id:data.id,msg:'creating timematrix'})

	//split the input region in squares for parallelisation
	var box = envelope(data.feature);
	var extent =[box.geometry.coordinates[0][0][0],box.geometry.coordinates[0][0][1],box.geometry.coordinates[0][2][0],box.geometry.coordinates[0][2][1]];
	var squares =  squareGrid(extent,30, 'kilometers');

	//tell the client how many squares there are
	io.emit('status',{id:data.id,msg:'split region in '+squares.features.length+' grid squares'})

	cETA.send({data:data,squares:squares.features,POIs:POIs,villages:villagesFile,osrm:osrm});
	var remaining = squares.features.length;
	cETA.on('message',function(msg){
		if(msg.type == 'status') {
			console.log(msg.data);
			io.emit('status',{id:data.id,msg:msg.data});
		}
		else if(msg.type=='square') {
			remaining--;
			io.emit('status',{id:data.id,msg:remaining+' squares remaining'});
		}
		else if(msg.type =='done') {
			//we are done, save as csv and send the filename
			var calculationTime = (new Date().getTime()-beginTime)/1000;
			var timing = Math.round(calculationTime) + ' seconds';
			if(calculationTime>60) timing = Math.round(calculationTime/60)+' minutes';
			console.log('timing: '+timing);
            io.emit('status',{id:data.id,msg:'timematrix has been calculated in '+timing});
            io.emit('status',{id:data.id,msg:'writing result to disk, this might take a while'});
			var print = d3.csv.format(msg.data);
			var file = data.geometryId+'-'+data.id+'.csv';
		    fs.writeFile(dir+file, print, function(err){
		        if(err) {
	                return console.log(err);
                }
				console.log('finished '+file);
				 io.emit('status',{id:data.id,msg:'finished'});
				io.emit('status',{id:data.id,type:'poilist',file:file,geometryId:data.geometryId});
				cETA.disconnect();
	        });
		}
	});
}



