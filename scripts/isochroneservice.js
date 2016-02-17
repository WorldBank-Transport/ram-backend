var express = require('express');
var Isochrone = require('osrm-isochrone');
var app = express();
var turf = require('turf');
var lineToPolygon = require('turf-line-to-polygon');
var fs = require('fs');
var async = require('async');
var points = JSON.parse(fs.readFileSync('./Village_pop.geojson', 'utf8'));

/*
fs.readFile('./Village_pop.geojson', function(err,data) {
	if(err) {
		throw err;
	}
	console.log(data)
})*/

var allowCrossDomain = function(req, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
}
app.use(allowCrossDomain);


app.get('/', function (req, res) {	
  res.send('Hello World!');
});

app.get('/isochrone',function (req, res) {
	console.log(req.query)
	var lat = parseFloat(req.query.lat);
	var lon = parseFloat(req.query.lon);
	var scale = parseFloat(req.query.res);
	var time = parseFloat(req.query.time);
	makeIsochrone({lat:lat,lon:lon,scale:scale},res,time);	
})

app.get('list',function(req,res) {
	var lat = parseFloat(req.query.lat);
	var lon = parseFloat(req.query.lon);
	var time = parseFloat(req.query.time);
	var pois = req.query.pois;
	console.log(pois);
	res.send('poi')
})
app.listen(5000, function () {
  console.log('Example app listening on port 3000!');
});

var makeIsochrone = function(options,res,time) {
	console.log('makeIsochrone '+time)
	//var times = [1800,3600,5400]//,7200,9000,10800,12600,14400];
	var location = [options.lon,options.lat];
	var o = {
		resolution:options.scale,
		maxspeed: 120,
		unit:'kilometers',
		network:'/home/steven/osrm-backend/build/map1.osrm'
	}
	var result= {"type":"FeatureCollection","features":[]};
	console.log(time);
	var isochrone = new Isochrone(location,time,o,function(err,drivetime){
		console.log(drivetime.features.length);
		result.features = sumPopulation(drivetime.features);
		res.send(result);
		console.log('send')
	})
	isochrone.getIsochrone()
	//})
	/*
	var populations = [];
	isochrone(location,times[0],o,function(err,drivetime){
		console.log(drivetime.features.length);
		res.send(sumPopulation(drivetime.features));
	})*/
	/*
	async.each(times,function (time,i) {		
		isochrone(location,time,o,function (err, drivetime) {
			if(err) throw err;	
			if(drivetime.features.length > 0) {
				drivetime.features.forEach(function(feature){
					var point = turf.explode(feature);
					console.log('point');
					var poly = turf.featurecollection(turf.concave(point,10,'kilometers'));
					console.log(JSON.stringify(poly));
					var sum  = turf.sum(poly,points,'POP','sum');
					console.log('sum');
					sum.forEach(function (sfeature) {
						result.features.push(sfeature);
					})	
				})
						
			}
			if(i == times.length-1) {
				res.send(result);
				console.log('send');
			}
			console.log(i)
		})
	})*/
}

function sumPopulation (features) {
	//var result = {"type": "FeatureCollection","features": []};
	var result = [];
	if (features.length===0) {
		console.log('NO drivetime features')
	}
    else {
		features.forEach(function (feature) {
			if(feature.geometry.coordinates.length > 3) { 
				var poly = turf.featurecollection([lineToPolygon(feature)]);
				var summedpolygons = turf.sum(poly,points,'POP','totalPopulation');
				var rfeatures = result.concat(summedpolygons.features);
				result = rfeatures;
			}
		})
	}
	console.log('done')
	return result;
}
//async: loop through 'times' > foreach do isochrone > foreach isochrone linestring 'polygonise' > for each polygon do sum
// return: polygons with sums