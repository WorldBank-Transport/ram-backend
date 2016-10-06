var express = require('express'),
    app = express(),
    http = require('http').Server(app),
    url = require("url"),
    path = require("path"),
    fs = require("fs"),
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

        mkdirp(dir+uid, function(err) {  if(err) console.log(err); });
        mkdirp(dir+uid+'/csv/', function(err) {  if(err) console.log(err); });
        mkdirp(dir+uid+'/POIs/', function(err) {  if(err) console.log(err); });
        mkdirp(dir+uid+'/baseline/', function(err) {  if(err) console.log(err); });
        mkdirp(dir+uid+'/maps/', function(err) {  if(err) console.log(err); });

        PROJECTS[uid] = {};
        PROJECTS[uid].POIs = {};
        for(var poi in project.pois) {
          PROJECTS[uid].POIs[poi] = JSON.parse(fs.readFileSync('./web/data/'+uid+'/'+project.pois[poi],'utf8'));
        }
        PROJECTS[uid].villages =  JSON.parse(fs.readFileSync('./web/data/'+uid+'/'+project.villages,'utf8'));
    });
  }
});



//basic authentication stuff
var auth = function (req, res, next) {
  function unauthorized(res) {
    res.set('WWW-Authenticate', 'Basic realm=Authorization Required');
    return res.sendStatus(401);
  }

  var user = basicAuth(req);

  if (!user || !user.name || !user.pass) {
    return unauthorized(res);
  }
//TODO: allow for more than 1 user in credentials
  if (user.name === credentials.user && user.pass === credentials.pass) {
    return next();
  } else {
    return unauthorized(res);
  }
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
  if(username == credentials.user && password===credentials.pass){
    return callback(null, true);
  }
  else return callback(null, false);
}


function postAuthenticate(socket, data) {
  var beginTime;
  socket.emit('status', {socketIsUp: true}); //tell the client it is connected
  CLIENTS.push(socket);

  socket.on('disconnect',function(){
    CLIENTS.splice(CLIENTS.indexOf(socket),1);
    io.emit('status',{users:CLIENTS.length});
  });

  io.emit('status',{users:CLIENTS.length});
  socket.emit('config',{config:CONFIGURATION});
  if(CONFIGURATION) {
    //there is a configuration file so we can proceed.
  //  socket.on('getisochrone', createIsochrone); //create isochrones
    //TODO: figure out how to move this to project dir
    var uploader = new siofu();
    uploader.dir = './web/data/tmp';
    uploader.listen(socket);
    uploader.on('complete',function(e){
      var file = e.file.name;
      var fsplit = file.split('.');
      if(fsplit[fsplit.length-1].toLowerCase()!=='zip') {
        socket.emit('status',{msg:'invalid zip file'});
      }
      else {
       socket.emit('uploadComplete',{file:e.file.pathName});
      }
    });

    socket.on('getMatrixForRegion',createTimeMatrix);

    socket.on('setOSRM',function(data){
      var idx =getProjectIdx(data.project);
      CONFIGURATION[idx].activeOSRM = data.osrm;
      socket.emit('newOsrm',{newOsrm:CONFIGURATION[idx].activeOSRM,project:data.project});
      socket.emit('status',{msg:'srv_nw_changed',p0:CONFIGURATION[idx].activeOSRM.name});
    });

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
            osrmlist.push(meta);
          }
        });
      socket.emit('osrmList',{osrm:osrmlist,project:data.project});
    });

    socket.on('removeOsrm',function (data) {
      var p =CONFIGURATION[getProjectIdx(data.project)];
      if(p.activeOSRM.created.time === data.osrm.created.time){
        p.activeOSRM = p.baseline;
        socket.emit('newOsrm',{newOsrm:p.activeOSRM,project:data.project});
      }
      rimraf(data.osrm.dir,function (err) {
        if(err) throw err;
        io.emit('removedOsrm',{project:data.project});
      });
    });

    socket.on('retrieveResults',function(data){
      var dir = data.project;
      var files = fs.readdirSync('./web/data/'+dir+'/csv/');
      var jsons = files.filter(function (d) { return d.slice(-5).toLowerCase() === ".json";   });
      var result = [];
      jsons.sort(function(a, b) {
        return fs.statSync('./web/data/'+dir+'/csv/' + a).mtime.getTime() - fs.statSync('./web/data/'+dir+'/csv/' + b).mtime.getTime();
      });
      jsons.forEach(function (d,idx) {
        result[idx] = {result:JSON.parse(fs.readFileSync('./web/data/'+dir+'/csv/'+d)),counter:idx,project:data.project};


      });
      socket.emit('resultJson',result);
    });

    socket.on('unzip',function (data) {
      var dir = './web/data/' +data.project + '/tmp_'+new Date().getTime()+'/';
      mkdirp(dir, function(err) {  if(err) console.log(err); });
      var cmd = './unzip.sh -f '+data.file+ ' -d '+dir;
      exec(cmd,function(error,stdout,stderr){
        if (error !== null) {
          console.log('exec error: ' + error);
        }
        if(stdout.indexOf('shp')>-1) {
          //we have a shapefile, proceed to ogr2osm
          ogr2osm(dir,socket,data);
        }
        else if(stdout.indexOf('osm')>-1) {
          //we have an osm file proceed to osm2osrm
          osm2osrm(dir,socket,data);
        }
        else if(stdout.indexOf('profile')>-1) {
          //we only have a profile file proceed to osm2osrm
          profile2osrm(dir,socket,data);
        }
        else {
          rimraf(dir,function (d) {
            socket.emit('status',{project:data.project,msg:"invalid content"});
          });
        }
      }) ;

    });

  }



  /* triggers on the socket */
  socket.on('debug',function(data){console.log(data);}); //debug modus


 }

function getProjectIdx(uid) {
  var idx = -1;
  for(var i =0, len = CONFIGURATION.length; i < len; i++){
    if(CONFIGURATION[i].uid===uid) idx =i;
  }
  return idx;
}


function ogr2osm(dir,socket,data) {
  var cmd = './ogr2osm.sh -d '+dir;
  exec(cmd,function(error,stdout,stderr){
    if (error !== null) {
      console.log('exec error: ' + error);
    }
    if(stdout.indexOf('done')>-1) {
        osm2osrm(dir,socket,data);
    }
    else {
      rimraf(dir,function (d) {
        socket.emit('status',{project:data.project,msg:"convert to osm failed"});
      });
    }

  });
}

function osm2osrm(dir,socket,data) {
  var cmd = './osm2osrm.sh -d '+dir;
  exec(cmd,function(error,stdout,stderr){
    if (error !== null) {
      console.log('exec error: ' + error);
    }
    if(stdout.indexOf('fail')===0) {
        socket.emit('status',{project:data.project,msg:"convert to osrm failed"});
    } else {
      var ls = stdout.split('\n');
      var uid =new Date().getTime();
      var meta = {
        "created":{
          "time":uid,
          "user":"steven"
        },
        files: {
          "osrm": ls[0].split('/')[1],
          "osm": ls[1].split('/')[1],
          "profile": ls[2].split('/')[1]
        },
        "name":stdout.split('/')[1].split('.')[0],
        "uid":'map_'+uid
      };
      var metafile = './web/data/' +data.project +'/maps/'+ls[0].split('/')[0]+'/meta.json';
      fs.writeFileSync(metafile,JSON.stringify(meta));
      var idx =getProjectIdx(data.project);
      var dir = CONFIGURATION[idx].uid;
      var osrmfiles = fs.readdirSync('./web/data/'+dir+'/maps/');
      var osrmlist = [];
      osrmfiles.forEach(function(o){
          var files = fs.readdirSync('./web/data/'+dir+'/maps/'+o);
          if(files.indexOf('meta.json')>-1) {
            var meta = JSON.parse(fs.readFileSync('./web/data/'+dir+'/maps/'+o+'/meta.json'));
            meta.dir = './web/data/'+dir+'/maps/'+o;
            osrmlist.push(meta);
          }
        });
      socket.emit('osrmList',{osrm:osrmlist,project:data.project});
      socket.emit('status',{msg:"network created"});
    }

  });
}


function profile2osrm(dir,socket,data) {
  var osmdir =data.osrm.dir;
  var cmd = './profile2prepare.sh -i '+osmdir+ ' -o '+dir;
  exec(cmd,function(error,stdout,stderr){
    if (error !== null) {
      console.log('exec error: ' + error);
    }
    if(stdout.indexOf('done')>-1) {
      osm2osrm(dir,socket,data);
    }
  });
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

  var osrm = __dirname+"/"+c.activeOSRM.dir+'/'+c.activeOSRM.files.osrm;
  console.log(osrm);
  var cETA = fork('./scripts/node/calculateETA.js');
  beginTime = new Date().getTime();
  if(!data||!data.feature) {
    console.warn('no data');
    return false;
  }
  data.maxTime = data.maxTime || c.maxTime;
  data.maxSpeed = data.maxSpeed || c.maxSpeed;

  io.emit('status',{id:data.id,msg:'srv_creating_tm',project:data.project});

  //split the input region in squares for parallelisation
  var box = envelope(data.feature);
  var extent =[box.geometry.coordinates[0][0][0],box.geometry.coordinates[0][0][1],box.geometry.coordinates[0][2][0],box.geometry.coordinates[0][2][1]];
  var squares =  squareGrid(extent,30, 'kilometers');

  //tell the client how many squares there are
  io.emit('status',{id:data.id,msg:'srv_split_squares',p0:squares.features.length,project:data.project});
  cETA.send({data:data,squares:squares.features,POIs:p.POIs,villages:p.villages,osrm:osrm,id:data.id,project:data.project});
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
      console.log(msg.data);
      var networkfile = msg.osrm.split('/')[msg.osrm.split('/').length-1];
      var osrmfile = networkfile.split('.')[0];
      var print = d3.csv.format(msg.data);
      var subfile = data.geometryId+'-'+msg.id+'-'+osrmfile;
      var file = subfile+'.csv';
      var fullpath = './web/data/'+data.project+'/csv/';
      var meta = {
        "created":{
          "time":new Date().getTime(),
          "user":"steven"
        },
        "name":subfile,
        "csvfile":file
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
