
mapboxgl.accessToken = 'pk.eyJ1Ijoid2hlcmVjYW1wZXUiLCJhIjoieHE4bVNuRSJ9.qFTj9L2TMzVXX8G2QwJl_g';
var map = new mapboxgl.Map({
    container: 'map', // container id
    style: 'mapbox://styles/mapbox/light-v8', //stylesheet location
    center: [107.5, 26.5], // starting position
    zoom: 5 // starting zoom
});
var sourceObj;
map.on('style.load', function () {
sourceObj = new mapboxgl.GeoJSONSource({
   data: {
       "type": "FeatureCollection",
       "features": []
   }
});
renderChoropleth()
});


var layers = [
	['#800026',1000],
	['#bd0026',70],
	['#e31a1c',60],
	['#fc4e2a',50],
	['#fd8d3c',40],
	['#feb24c',30],
	['#fed976',20],
	['#ffeda0',10],
	['#ffffcc',0]
];


var facet = 'hospitals';

function filterBy() {
    // Which value in each layers array
    // should be used for filtering.


    layers.forEach(function(layer, i) {
        var filters = [
            'all',
            ['>=', facet, layer[1]],
        ];

        if (i !== 0) filters.push(['<', facet, layers[i - 1][1]]);
        map.setFilter('layer-' + i, filters);

       
    });
}
var popup = new mapboxgl.Popup({
    closeButton: false
});
function renderChoropleth() {
   
  map.addSource('villages', sourceObj); // add

    layers.forEach(function(layer, i) {
        map.addLayer({
            "id": "layer-" + i,
            "type": "circle",
            "interactive": true,
            "source": "villages",
            "paint": {
                "circle-color": layer[0],
                "circle-opacity": 0.75
            }
        });

    });

    // Initially filter this by the state level
    filterBy();
}

function onTheMap(){
  var points = volumeByPopulation.top(Infinity).map(function(d){
    return {
             "type": "Feature",
             "geometry": {
                 "type": "Point",
                 "coordinates": [
                     d.lon,
                     d.lat
                 ]
             },
              "properties": {
                      "hospitals": d.hospitals,
                      "schools": d.schools,
                      "prefectures": d.prefectures,
                      "banks":d.banks,
                      "counties":d.counties,
                      "population":d.population,
                      "name":d.NAME,
                      "nameEn":d.NAME_4,
                      "county":d.county
                  }
         }
  })
  if(points.length > 50000) {
    alert('too many villages, select less the 50,000')
  }
  else {
 	 sourceObj.setData({
         "type": "FeatureCollection",
         "features":points})
 	 filterBy()
  }
}

map.on('mousemove', function(e) {
    map.featuresAt(e.point, {
    	radius: 10,
        // Collect each layer id we created into an array.
        layer: layers.map(function(layer, i) {
            return 'layer-' + i;
        })
    }, function(err, features) {
        // Change the cursor style as a UI indicator.
        map.getCanvas().style.cursor = (!err && features.length) ? 'pointer' : '';

        if (err || !features.length) {
            popup.remove();
            return;
        }

        var details = features[0].properties;

        // Initialize a popup and set its coordinates
        // based on the feature found.
        popup.setLngLat(e.lngLat)
            .setHTML('<h5>'+details.name + ' - ' +details.nameEn+ '</h5>County: '+details.county+ '<br/>population: ' + details.population+'<br/>' + details[facet].toLocaleString() +' minutes to '+facet)
            .addTo(map);
    });
});