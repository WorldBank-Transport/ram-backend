var express = require('express');
var Isochrone = require('osrm-isochrone');
var app = express();
var turf = require('turf');
var lineToPolygon = require('turf-line-to-polygon');
var fs = require('fs');

var points = JSON.parse(fs.readFileSync('../../data/Ready to Use/Village_pop.geojson', 'utf8'));
var network = '/home/steven/osrm-backend/build/map.osrm';

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
	var lat = parseFloat(req.query.lat);
	var lon = parseFloat(req.query.lon);
	var scale = parseFloat(req.query.res);
	var time = parseFloat(req.query.time);
	makeIsochrone({lat:lat,lon:lon,scale:scale},res,time);	
})
app.listen(5000, function () {
  console.log('Example app listening on port 5000!');
});

/*
Create isochrones based on the input parameters
*/
var makeIsochrone = function(options,res,time) {
	console.log('make isochrone for:'+options.lon+','+options.lat+' @'+time)
	var location = [options.lon,options.lat];
	var o = {
		resolution:options.scale,
		maxspeed: 120,
		unit:'kilometers',
		network:network
	}
	var result= {"type":"FeatureCollection","features":[]};
	var isochrone = new Isochrone(location,time,o,function(err,drivetime){
		console.log('number of isochrone-features: '+drivetime.features.length);
		result.features = sumPopulation(drivetime.features);
		res.send(result);
		console.log('send')
	})
	isochrone.getIsochrone()
}

/*
Calculate the population given an array of isochrone-lines
*/
function sumPopulation (features) {
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
	return result;
}