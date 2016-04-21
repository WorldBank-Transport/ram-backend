var express = require('express'),
    app = express(),
    http = require('http').Server(app),
    url = require("url"),
    path = require("path"),
    fs = require("fs")
    port = process.argv[2] || 8888,
    fork = require('child_process').fork,
    basicAuth = require('basic-auth'),
    compression = require('compression'),
    io = require('socket.io')(http),
    authio = require('socketio-auth'),
    os = require('os'),
    d3 = require('d3'),
    mkdirp = require('mkdirp'),    
    envelope = require('turf-envelope'),
    squareGrid = require('turf-square-grid'),
    siofu = require("socketio-file-upload"),
    exec = require('child_process').exec;

//Keeping the credentials outside git
var credentials = JSON.parse(fs.readFileSync('./data/user.json','utf8'));


//basic authentication stuff
var auth = function (req, res, next) {
  function unauthorized(res) {
    res.set('WWW-Authenticate', 'Basic realm=Authorization Required');
    return res.sendStatus(401);
  };

  var user = basicAuth(req);

  if (!user || !user.name || !user.pass) {
    return unauthorized(res);
  };

  if (user.name === credentials.user && user.pass === credentials.pass) {
    return next();
  } else {
    return unauthorized(res);
  };
};

app.use('/', [auth, compression(),express.static(__dirname + '/',{ maxAge: 86400000 })]);

http.listen(parseInt(port, 10));
console.log("Static file server running at\n  => http://localhost:" + port + "/\nCTRL + C to shutdown");




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
var defaultOsrm = './data/OSRM-ready/baseline.osrm';
var osrm = defaultOsrm;
var dir = './data/';
var credentials = JSON.parse(fs.readFileSync('./data/user.json','utf8'));

var maxSpeed = 120,
  maxTime = 3600;


//create csv output dir
mkdirp(dir+'csv/', function(err) { 
  if(err) console.log(err)
});
//create shp2osm dir
mkdirp(dir+'shp2osm/', function(err) { 
  if(err) console.log(err)
});
//create osm2osrm dir
mkdirp(dir+'osm2osrm/', function(err) { 
  if(err) console.log(err)
});

var villages = JSON.parse(fs.readFileSync(villagesFile, 'utf8'));

authio(io, {
  authenticate: authenticate, 
  postAuthenticate: postAuthenticate,
  timeout: 1000
});

function authenticate(socket, data, callback) {
  var username = data.username;
  var password = data.password;
  if(username == credentials.user && password==credentials.pass){
  return callback(null, true);
  }
  else return callback(null, false)
}
var allClients = [];
function postAuthenticate(socket, data) {
  var beginTime;
  socket.emit('status', {socketIsUp: true}); //tell the client it is connected
  allClients.push(socket);
  io.emit('status',{users:allClients.length})
  var files = fs.readdirSync(dir+'csv/');
  files.sort(function(a, b) {
       return fs.statSync(dir+'csv/' + a).mtime.getTime() - fs.statSync(dir+'csv/' + b).mtime.getTime();
    });

  socket.emit('status',{csvs:files}); //send the current list of csv files

  /* triggers on the socket */
  socket.on('debug',function(data){console.log(data)}); //debug modus

  socket.on('getisochrone', createIsochrone); //create isochrones

  socket.on('getMatrixForRegion',createTimeMatrix);

  socket.on('disconnect',function(){
    allClients.splice(allClients.indexOf(socket),1)
    io.emit('status',{users:allClients.length})
  })
  socket.on('setOSRM',function(data){
    osrm = data.osrm;
    socket.emit('status',{newOsrm:osrm});
    socket.emit('status',{msg:'srv_nw_changed',p0:osrm});
  })
  socket.on('retrieveOSRM',function(){
    var osrmfiles = fs.readdirSync(dir+'maps/');
    var osrmlist = osrmfiles.reduce(
      function(p,o){
        var files = fs.readdirSync(dir+'maps/'+o);
        if(files.length > 0) p.push('./data/maps/'+o+'/'+files[0].split('.')[0]+'.osrm')
        return p
      },[]
    )
    osrmlist.push(defaultOsrm);
    socket.emit('status',{osrm:osrmlist});
  })
  var uploader = new siofu();
  uploader.dir = dir;
  uploader.listen(socket);
  uploader.on('complete',uploadComplete)
};

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
  io.emit('status',{id:data.id,msg:'srv_create_isochrone',p0:data.time})

  cISO.send({data:data,villages:villagesFile,osrm:osrm,maxSpeed:maxSpeed});
  
  cISO.on('message',function(msg){
    if(msg.type == 'error') {
      console.warn(msg.data);
    }
    else if(msg.type =='done') {
      io.emit('status',{id:data.id,msg:'srv_finished'});
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

  io.emit('status',{id:data.id,msg:'srv_creating_tm'})

  //split the input region in squares for parallelisation
  var box = envelope(data.feature);
  var extent =[box.geometry.coordinates[0][0][0],box.geometry.coordinates[0][0][1],box.geometry.coordinates[0][2][0],box.geometry.coordinates[0][2][1]];
  var squares =  squareGrid(extent,30, 'kilometers');

  //tell the client how many squares there are
  io.emit('status',{id:data.id,msg:'srv_split_squares',p0:squares.features.length})

  cETA.send({data:data,squares:squares.features,POIs:POIs,villages:villagesFile,osrm:data.osrm});
  var remaining = squares.features.length;
  cETA.on('message',function(msg){
    if(msg.type == 'status') {
      console.log(msg.data);
      io.emit('status',{id:data.id,msg:msg.data});
    }
    else if(msg.type=='square') {
      remaining--;
      io.emit('status',{id:data.id,msg:'srv_remaining_squares',p0:remaining});
    }
    else if(msg.type =='done') {
      //we are done, save as csv and send the filename
      var calculationTime = (new Date().getTime()-beginTime)/1000;
      var timing = Math.round(calculationTime);
      if(calculationTime>60) {
        timing = Math.round(calculationTime/60);
        io.emit('status',{id:data.id,msg:'srv_calculated_in_m',p0:timing});
            
      }
      else {
        io.emit('status',{id:data.id,msg:'srv_calculated_in_s',p0:timing});
            
      }
      console.log('timing: '+timing);
            io.emit('status',{id:data.id,msg:'srv_writing'});
      var networkfile = data.osrm.split('/')[data.osrm.split('/').length-1];
      var osrmfile = networkfile.split('.')[0];
      var print = d3.csv.format(msg.data);
      var file = data.geometryId+'-'+data.id+'-'+osrmfile+'.csv';
        fs.writeFile(dir+'/csv/'+file, print, function(err){
            if(err) {
                  return console.log(err);
                }
        console.log('finished '+file);
         io.emit('status',{id:data.id,msg:'srv_finished'});
        io.emit('status',{id:data.id,type:'poilist',file:file,geometryId:data.geometryId});
        cETA.disconnect();
          });
    }
  });
}



function uploadComplete(e) {
  var file = e.file.name;
  var fsplit = file.split('.');
  if(fsplit[fsplit.length-1].toLowerCase()=='zip') {
    var cmd = './prepare.sh -f '+file+ ' -d '+dir;
      exec(cmd,function(error,stdout,stderr){
        if (error !== null) {
            console.log('exec error: ' + error);
        }
        var msg = stdout + '';
        io.emit('status',{msg:'srv_finished_preparing'})
        io.emit('status',{result:msg})
      })  
  }
}