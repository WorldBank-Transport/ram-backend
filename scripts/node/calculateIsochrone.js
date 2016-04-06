 var OSRM = require('osrm'),
    Isochrone = require('osrm-isochrone'),
    os = require('os'),
    fs = require('fs'),
    within = require('turf-within'),
    point = require('turf-point'),
    buffer = require('turf-buffer'),
    featurecollection = require('turf-featurecollection');

var villages;

var cpus = os.cpus().length;
process.env.UV_THREADPOOL_SIZE=Math.floor(cpus*1.5);

process.on('message', function(e) {
    var data = e.data;
    var maxSpeed = e.maxSpeed;
    var osrm = new OSRM(e.osrm);
    villages = JSON.parse(fs.readFileSync(e.villages, 'utf8'));
    var workingSet =villagesInCircle(data.center,Math.max.apply(Math,data.time),maxSpeed);
    var options = {
        resolution: data.res,
        maxspeed: maxSpeed,
        unit: 'kilometers',
        network: osrm,
        destinations: workingSet,
        id:data.id
    }
    data.time.forEach(function(time){
        var isochrone = new Isochrone(data.center,time,options,function(err,features){
            if(err) process.send({type:'error',data:err});
            process.send({type:'done',data:features});
        })
        isochrone.getIsochrone();
    })
});

    //helper function to retrieve the villages within maxSpeed*maxTime radius
function villagesInCircle(center,time,speed) {
    var centerPt = point([center[0],center[1]]);
    var length = (time*2/3600)*speed;
    var circle = featurecollection([buffer(centerPt,length,'kilometers')]);
    var result = within(villages,circle);
    return result;
}

