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
    exec = require('child_process').exec,
    rimraf = require('rimraf');

//GLOBALS
var CONFIGURATION=false,
    CLIENTS = [],
    PROJECTS = {};
//Keeping the credentials outside git
var credentials = JSON.parse(fs.readFileSync('./web/data/user.json','utf8'));

fs.exists('./web/data/config.json',function(exists) {
  if(exists){
    CONFIGURATION=JSON.parse(fs.readFileSync('./web/data/config.json','utf8'));
    var dir = './web/data/';
    CONFIGURATION.forEach(function(project){
        var uid = project.uid;

        mkdirp(dir+uid, function(err) {  if(err) console.log(err) });
        mkdirp(dir+uid+'/csv/', function(err) {  if(err) console.log(err) });
        mkdirp(dir+uid+'/POIs/', function(err) {  if(err) console.log(err) });
        mkdirp(dir+uid+'/baseline/', function(err) {  if(err) console.log(err) });
        mkdirp(dir+uid+'/maps/', function(err) {  if(err) console.log(err) });
        
        PROJECTS[uid] = {};
        PROJECTS[uid].POIs = {};
        for(poi in project.pois) {
          PROJECTS[uid].POIs[poi] = JSON.parse(fs.readFileSync('./web/data/'+uid+'/'+project.pois[poi],'utf8'));
        }
        PROJECTS[uid].villages =  JSON.parse(fs.readFileSync('./web/data/'+uid+'/'+project.villages,'utf8'));
    })
  }
})
 


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
//TODO: allow for more than 1 user in credentials
  if (user.name === credentials.user && user.pass === credentials.pass) {
    return next();
  } else {
    return unauthorized(res);
  };
};

app.use('/', [auth, compression(),express.static(__dirname + '/web/',{ maxAge: 86400000 })]);

http.listen(parseInt(port, 10));
console.log("Static file server running at\n  => http://localhost:" + port + "/\nCTRL + C to shutdown");




authio(io, {
  authenticate: authenticate, 
  postAuthenticate: postAuthenticate,
  timeout: 1000
});

function authenticate(socket, data, callback) {
  var username = data.username;
  var password = data.password;
//TODO: allow for more than 1 user in credentials
  if(username == credentials.user && password==credentials.pass){
    return callback(null, true);
  }
  else return callback(null, false)
}


function postAuthenticate(socket, data) {
  var beginTime;
  socket.emit('status', {socketIsUp: true}); //tell the client it is connected
  CLIENTS.push(socket);

  socket.on('disconnect',function(){
    CLIENTS.splice(CLIENTS.indexOf(socket),1)
    io.emit('status',{users:CLIENTS.length})
  })

  io.emit('status',{users:CLIENTS.length});
  socket.emit('config',{config:CONFIGURATION});
  if(CONFIGURATION) {
    //there is a configuration file so we can proceed.
  //  socket.on('getisochrone', createIsochrone); //create isochrones
    //TODO: figure out how to move this to project dir
    var uploader = new siofu();
    uploader.dir = './web/data/'+CONFIGURATION[0].uid;
    uploader.listen(socket);
    uploader.on('complete',uploadComplete)

    socket.on('getMatrixForRegion',createTimeMatrix);

    socket.on('setOSRM',function(data){
      var idx =getProjectIdx(data.project);
      CONFIGURATION[idx].activeOSRM = data.osrm;
      socket.emit('newOsrm',{newOsrm:CONFIGURATION[idx].activeOSRM,project:data.project});
      socket.emit('status',{msg:'srv_nw_changed',p0:CONFIGURATION[idx].activeOSRM.name});
    })

    socket.on('retrieveOSRM',function(data){
      var idx =getProjectIdx(data.project);
      var dir = CONFIGURATION[idx].uid;
      var osrmfiles = fs.readdirSync('./web/data/'+dir+'/maps/');
      var osrmlist = [];
      osrmfiles.forEach(function(o){
          var files = fs.readdirSync('./web/data/'+dir+'/maps/'+o);
          if(files.indexOf('meta.json')>-1) {
            var meta = JSON.parse(fs.readFileSync('./web/data/'+dir+'/maps/'+o+'/meta.json'));
            meta.dir = './web/data/'+dir+'/maps/'+o;
            osrmlist.push(meta)
          }
        })
      socket.emit('osrmList',{osrm:osrmlist,project:data.project});
    })

    socket.on('removeOsrm',function (data) {
      rimraf(data.osrm.dir,function (d) {
        if(err) throw err;
        io.emit('removedOsrm')
      })
    })

    socket.on('retrieveResults',function(data){
      var idx =getProjectIdx(data.project);
      var dir = CONFIGURATION[idx].uid;
      var files = fs.readdirSync('./web/data/'+dir+'/csv/');
      var jsons = files.filter(function (d) { return d.slice(-5).toLowerCase() === ".json"   });
      jsons.sort(function(a, b) {
        return fs.statSync('./web/data/'+dir+'/csv/' + a).mtime.getTime() - fs.statSync('./web/data/'+dir+'/csv/' + b).mtime.getTime();
      });
      jsons.forEach(function (d,idx) {
        fs.readFile('./web/data/'+dir+'/csv/'+d,function(err,data)  { 
          if (err) throw err;
          socket.emit('resultJson',{result:JSON.parse(data),counter:idx,project:data.project})
        })
      })
    })

  }
  

  
  /* triggers on the socket */
  socket.on('debug',function(data){console.log(data)}); //debug modus

 
 };









function getProjectIdx(uid) {
  var idx = -1;
  for(var i =0, len = CONFIGURATION.length; i < len; i++){
    if(CONFIGURATION[i].uid===uid) idx =i;
  }
  return idx;
}












/* create an isochrone
requires:
data.center [lon,lat]
data.id ID of the run (timestamp)
data.time int with isochrone time in seconds
data.res int with the resolution of the isochrone

returns:
isochrone features
*//*
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
}*/

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
  var idx =getProjectIdx(data.project);
  var c = CONFIGURATION[idx];
  var p = PROJECTS[data.project];
  var osrm = './web/data/'+data.project+'/'+c.activeOSRM;
  console.log(osrm);
  var cETA = fork('./scripts/node/calculateETA.js');
  beginTime = new Date().getTime();
  if(!data||!data.feature) {
    console.warn('no data')
    return false;
  }
  data.maxTime = data.maxTime || c.maxTime;
  data.maxSpeed = data.maxSpeed || c.maxSpeed;

  io.emit('status',{id:data.id,msg:'srv_creating_tm',project:data.project})

  //split the input region in squares for parallelisation
  var box = envelope(data.feature);
  var extent =[box.geometry.coordinates[0][0][0],box.geometry.coordinates[0][0][1],box.geometry.coordinates[0][2][0],box.geometry.coordinates[0][2][1]];
  var squares =  squareGrid(extent,30, 'kilometers');

  //tell the client how many squares there are
  io.emit('status',{id:data.id,msg:'srv_split_squares',p0:squares.features.length,project:data.project})

  cETA.send({data:data,squares:squares.features,POIs:p.pois,villages:p.villages,osrm:osrm,id:data.id,project:data.project});
  var remaining = squares.features.length;
  cETA.on('message',function(msg){
    if(msg.type == 'status') {
      console.log(msg.data);
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
      var file = data.geometryId+'-'+msg.id+'-'+osrmfile+'.csv';
      fs.writeFile('./data/'+c.dir+'/csv/'+file, print, function(err){
        if(err) {
          return console.log(err);
        }
        io.emit('status',{id:msg.id,msg:'srv_finished',project:data.project});
        io.emit('status',{id:msg.id,type:'poilist',file:file,geometryId:data.geometryId,project:data.project});
        cETA.disconnect();
      });
    }
  });
}



function uploadComplete(e) {
  var file = e.file.name;
  var fsplit = file.split('.');
  if(fsplit[fsplit.length-1].toLowerCase()=='zip') {
    var cmd = './unzip.sh -f '+file+ ' -d '+dir;
    exec(cmd,function(error,stdout,stderr){
      if (error !== null) {
        console.log('exec error: ' + error);
      }
      if(stdout.indexOf('done')>-1) {
        io.emit('status',{msg:'srv_finished_unzipping'})
        unzipComplete(file,dir);
      }
    })  
  }
}

function unzipComplete(file,dir) {
  io.emit('status',{msg:'srv_start_ogr2osm'})
  var cmd = './ogr2osm.sh -f '+file+ ' -d '+dir;
  exec(cmd,function(error,stdout,stderr){
    if (error !== null) {
      console.log('exec error: ' + error);
    }
    if(stdout.indexOf('done')>-1) {
      io.emit('status',{msg:'srv_finished_ogr2osm'})
      ogr2osmComplete(file,dir)
    }
    else {
      io.emit('status',{msg:'srv_failed_ogr2osm'})
    }
  })
}

function ogr2osmComplete(file,dir) {
  io.emit('status',{msg:'srv_start_osm2osrm'})
  var cmd = './osm2osrm.sh -f '+file+ ' -d '+dir;
  exec(cmd,function(error,stdout,stderr){
    if (error !== null) {
      console.log('exec error: ' + error);
    }
    if(stdout.indexOf('fail')>-1) {
      io.emit('status',{msg:'srv_failed_osm2osrm'})
    }
    else {
      var msg = stdout + '';
      io.emit('status',{msg:'srv_finished_preparing'})
      io.emit('status',{result:msg})
    }
  })
}