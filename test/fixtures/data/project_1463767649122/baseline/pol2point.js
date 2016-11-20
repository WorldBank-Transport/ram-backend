var fs = require('fs');
var turfCentroid = require('turf-centroid');
var geojson = require('./test-poipol.geojson');


for (var i = 0; i < geojson.features.length; i++) {
    if (geojson.features[i].geometry.type == "Polygon"){
      geojson.features[i].geometry = turfCentroid(geojson.features[i]).geometry;
    }

}

console.log(JSON.stringify(geojson, null, '  '));
//fs.writeFile(path.join("./public/data", `labels.geojson.json`), JSON.stringify(geojson, null, '  '));
