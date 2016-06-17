"use strict";
var PROJECT;
var CONNECTED = false;
var RESULTS = [];
var MAP;
//called when the socket is authenticated
function validSocket(socket) {
    socket.on('config',function(c){
        viewProject(c.config,socket);
    });
    socket.on('osrmList',function(data){
        createOsrmList(data);
    })
    socket.on('resultJson',function(data){
        addResult(data);
    })
    socket.on('newOsrm',function (data) {
      PROJECT.activeOSRM = data.activeOSRM;
      createActiveOsrm();
    })

}

function inValidSocket(socket) {
    socket.off('config');
    socket.off('osrmList')
    socket.off('resultJson')
}

function viewProject(json,socket) {
    var project = getUrlVars()['project'];
    PROJECT = json.filter(function (d) { return d.uid === project })[0];
    if(PROJECT===undefined) {
        if(json.length>0){
            PROJECT = json[0];
            project = PROJECT.uid;
        }
        else throw 'no project defined';
    }
    socket.emit('retrieveOSRM',{project:project});
    socket.emit('retrieveResults',{project:project});
    var pDiv = d3.select('#projectInfo').html('');

    pDiv.append('h2').text(PROJECT.name);
    pDiv.append('span').text('created at '+ new Date(parseInt(PROJECT.created)))

    pDiv.append('h3').text('baseline network')
    pDiv.append('span').text('created: '+ new Date(parseInt(PROJECT.baseline.created.time)))
    pDiv.append('span').text(' by '+ PROJECT.baseline.created.user);

    if(PROJECT.levels && PROJECT.levels.length >0&&!CONNECTED){
        createLevelSelector(PROJECT.levels,socket);
    }

    var rDiv = d3.select('#results')
    .selectAll('div')
    .data(RESULTS)
    .enter()
    .append('div');



}
function createActiveOsrm() {
  var osrmDiv =d3.select('#activeNetwork').html('');
  osrmDiv.datum(PROJECT.activeOSRM);

  osrmDiv
    .append('span')
    .text(function (d) { return 'Active network: '+d.name});
  osrmDiv.append('span')
    .text(function (d) { return ' created at ' + new Date(parseInt(d.created.time))});
 
}
function changeOsrm(data) {
  console.log(data);
}
function createOsrmList(data) {
    var nDiv = d3.select('#networkFiles').html('');
    var div = nDiv.append('div').selectAll('div')
    .data(data.osrm)
    .enter()
    .insert('div',":first-child").attr('class','checkbox').append('label');

    div.append('input')
      .attr('type','radio')
      .attr('class','osrmButtons')
      .attr('name','osrm')
      .attr('value',function(d){
        return d.created.time;
      })
      .on('change',function(d){
        changeOsrm(d)
      })

    .append('span')
    .text(function (d) { return d.name});
    div.append('span')
    .text(function (d) { return ' created at ' + new Date(parseInt(d.created.time))});
    div.append('span')
    .attr('class','btn btn-default glyphicon glyphicon-remove')
    var baseDiv =nDiv.insert('div',':first-child').attr('class','checkbox').append('label');
    baseDiv.append('input')
      .attr('type','radio')
      .attr('checked',true)
      .attr('class','osrmButtons')
      .attr('name','osrm')
      .attr('value',function(d){
        return ' baseline';
      })
      .on('change',function(d){
        changeOsrm(PROJECT.baseline);
      });
      baseDiv
    .append('span')
    .text('baseline')
    .append('span')
    .text( ' created at ' + new Date(parseInt(PROJECT.baseline.created.time)));

    nDiv.insert('h2',':first-child').text('available network files:');
    

    nDiv.append('div')
    .attr('class','btn btn-default')
    .text('add new network')    
    createActiveOsrm();
}

function createLevelSelector(data,socket) {
    var layer = new L.StamenTileLayer("toner-lite");
    MAP = new L.Map("map", {
      center: new L.LatLng(38.8991617,-77.0401631),
      zoom: 8
    });
    MAP.addLayer(layer);
    data.forEach(function (level) {
        addLevel(level,MAP,socket)
    })
    

}

var highlightStyle = {
  color: '#a6bddb', 
  weight: 2,
  opacity: 0.6,
  fillOpacity: 0.65,
  fillColor: '#a6bddb'
};
var defaultStyle = {
  color: "#a6bddb",
  weight: 1,
  opacity: 0.6,
  fillOpacity: 0.1,
  fillColor: "#a6bddb"
};
function addLevel(json, map,socket) {
    var file = '../data/'+PROJECT.uid+'/'+json.file;
    var el = d3.select('#levelSelector').append('div').attr('class','checkbox').append('label');
    d3.json(file,function (data) {
      json.area = L.geoJson(data, {
        style: defaultStyle,
        onEachFeature: function (feature, layer) {
          layer.on('click',function(e){
            generateCSV(feature,json.geometryId,socket);
          });
          layer.on('mousemove',function(e) {
            layer.setStyle( highlightStyle)
            d3.select('#countyname')
              .html(feature.properties[json.geometryId])
              .style({left:(e.originalEvent.layerX+15)+'px',top:(e.originalEvent.layerY+5)+'px'})
          })
          layer.on('mouseout',function(){
            layer.setStyle(defaultStyle);
            d3.select('#countyname')
              .html('')
          })
        }
      });
      var input = el.append('input')
      .datum(json)
      .attr('type','radio')
      .attr('class','levelButtons')
      .attr('name','level')
      .attr('value',function(d){return d.name})
      .on('change',function(d){
        MAP.eachLayer(function (layer) {
            if(!layer._url)
               MAP.removeLayer(layer)
            });
        d.area.addTo(MAP)
       });



      el.append('span')
      .text(json.name)
      

      MAP.fitBounds(json.area.getBounds());    
      if(!CONNECTED) {
       d3.select('#levelSelector>div>label>input').attr('checked',true);
        var d = d3.select('#levelSelector>div>label>input').data()[0];
        MAP.eachLayer(function (layer) {
            if(!layer._url)
               MAP.removeLayer(layer)
            });
        d.area.addTo(MAP)
      }
      CONNECTED =true;
    })


}

function generateCSV (feature,geometryId,socket) {
    socket.emit('getMatrixForRegion',{project:PROJECT.uid,feature:feature,id:new Date().getTime(),geometryId:feature.properties[geometryId]})
}

function addResult(data) {
    RESULTS[data.counter] = data.result;
       var rDiv = d3.select('#results')
    .selectAll('div')
    .data(RESULTS)
    .enter()
    .append('div')
    .text(function(d){return d.name})
}