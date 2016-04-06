
    var areafile = 'data/ReadytoUse/Guizhou_county.min.geojson';
    var area;
    var layer = new L.StamenTileLayer("toner-lite");
    var map = new L.Map("map", {
        center: new L.LatLng(26.5,107.5),
        zoom: 8
    });
    map.addLayer(layer);

    d3.json(areafile,function (data) {
        area = L.geoJson(data, {
            style: function(feature){
                return {color:'#a6bddb',weight:1}
            },
            onEachFeature: function (feature, layer) {
               layer.on('click',function(e){
                  if(e.originalEvent.ctrlKey) {
                    generateIsochrone(e.latlng,[900,1800,2700,3600]);//,4500,5400,6300,7200]);
                  }
                  else {
                    generateCSV(feature);
                  }
               });
               layer.on('mousemove',function(e) {
                  d3.select('#countyname')
                   .html(feature.properties.NAME_3)
                   .style({left:(e.originalEvent.layerX+15)+'px',top:(e.originalEvent.layerY+5)+'px'})
               })
               layer.on('mouseout',function(){
                 d3.select('#countyname')
                   .html('')
               })
            }
        });
        area.addTo(map);
        map.fitBounds(area.getBounds());
        d3.select('#generateAll')
        .on('click',function(){
            var all = turf.merge(data);
            all.properties = {};
            all.properties.OBJECTID = "Entire region"
            generateCSV(all)
        })
        
    })

function generateCSV (feature) {
   socket.emit('getMatrixForRegion',{feature:feature,id:new Date().getTime(),time:3600,maxSpeed:120,geometryId:feature.properties.OBJECTID})
}
function generateIsochrone (latlng,time){
  socket.emit('getisochrone',{center:[latlng.lng,latlng.lat],res:100,id:new Date().getTime(),time:time})
}