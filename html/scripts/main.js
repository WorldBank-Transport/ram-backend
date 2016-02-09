var counties = new ol.layer.Vector({
	source: new ol.source.Vector({
	  url: '../data/Ready to Use/Guizhou_county.geojson',
	  format: new ol.format.GeoJSON()
	})
});

var isoStyle = function() {
	var stroke = new ol.style.Stroke({color: '',width:2});
	var fill = new ol.style.Fill({color:''})
	var line = new ol.style.Style({
		     		stroke: stroke,
		     		fill: fill
		     	});
	var styles = [];
	return function(feature,resolution) {
		var length = 0;
		var eta = feature.get('eta');
		if(eta == 1800) {
			stroke.setColor('rgb(255,255,204)');
			fill.setColor('rgba(255,255,204,0.2)');
			styles[length++]=line;
    	}
    	else if(eta == 3600) {
			stroke.setColor('rgb(255,237,160)');
			fill.setColor('rgba(255,237,160,0.2)');
			styles[length++]=line;
		}
		else if(eta == 5400) {
			stroke.setColor('rgb(254,217,118)');
			fill.setColor('rgba(254,217,118,0.2)');
			styles[length++]=line;
		}
		else if(eta == 7200) {
			stroke.setColor('rgb(254,178,76)');
			fill.setColor('rgba(254,178,76,0.2)');
			styles[length++]=line;
		}
		else if(eta == 9000) {
			stroke.setColor('rgb(253,141,60)');
			fill.setColor('rgba(253,141,60,0.2)');
			styles[length++]=line;
		}
		else if(eta == 10800) {
			stroke.setColor('rgb(252,78,42)');
			fill.setColor('rgba(252,78,42,0.2)');
			styles[length++]=line;
		}
		else if(eta == 12600) {
			stroke.setColor('rgb(227,26,28)');
			fill.setColor('rgba(227,26,28,0.2)');
			styles[length++]=line;
		}
		else if(eta == 14400) {
			stroke.setColor('rgb(189,0,38)');
			fill.setColor('rgba(189,0,38,0.2)');
			styles[length++]=line;
		}
    	styles.length=length
    	return styles;
	}
}

var map = new ol.Map({
    target: 'map',
    layers: [
      new ol.layer.Tile({
        source: new ol.source.MapQuest({layer: 'sat'})
      }),
      counties//,heatmap
    ],
    view: new ol.View({
      center: ol.proj.fromLonLat([107.5, 26.5]),
      zoom: 8
    })
});


map.on('click',function(e){
	var c = ol.proj.toLonLat(e.coordinate);
	var times = [1800,3600,5400,7200,9000,10800,12600,14400];
	times.forEach(function(time,i){
		getisochrone(c,time,i);	
	})
	
})

function getisochrone (loc,time,i) {	
	var url = 'http://localhost:5000/isochrone/?lat='+loc[1]+'&lon='+loc[0]+'&res=30&time='+time;
	var isochrones = new ol.layer.Vector({
		style: isoStyle(),
		source:	new ol.source.Vector({
		  url: url,
		  format: new ol.format.GeoJSON()
		})	
	})
	map.addLayer(isochrones)
}