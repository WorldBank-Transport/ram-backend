var OSRMLIST;
var socket;
d3.json('../data/user.json',function(d){
  Authenticate(d.user,d.pass);
})
var socket;
function Authenticate(user,pass) {
  var sockethost = window.location.protocol +'//'+ window.location.host.split(':')[0] + ':5000'
  socket = io(sockethost);
  socket.on('connect', function(){
    socket.emit('authentication', {username: user, password: pass});
  });
  socket.on('unauthorized', function(err){
    alert('not a valid username or password, please try again.');
  });
  socket.on('authenticated', function() {
    socket.emit('retrieveOSRM');
    socket.on('status', function (data) {
      if(data.msg) {
          d3.select('#logfield')
          .insert("div", ":first-child")
          .html(data.msg)
      }
      else if (data.socketIsUp) {
          d3.select('#logfield')
          .insert("div", ":first-child")
          .html('connected to the server')
          .style({color:'green','font-weight':'bold'})
      }
      else if(data.osrm) {
        OSRMLIST = data.osrm;
        createOsrmList(data.osrm);
      }
      else if(data.file) {
        d3.select('#step4')
        .style('display','block');

        d3.select('#logfield')
          .insert("div", ":first-child")
          .html('Ready for the next task')
          .style({color:'green','font-weight':'bold'})
       
        d3.select('#csvlist')
          .insert("tr", ":first-child")
          .html(createCsvList(data.file))
      }
    });
    socket.on('finished',function(data){
      console.log('finished');
      if(!data||!data.type) throw('data and type are required');
      
    })
  })


  socket.on('disconnect',function(){
    d3.select('#logfield')
        .insert("div", ":first-child")
        .html('disconnected, hang on trying again in a few seconds')
        .style({color:'red','font-weight':'bold'})
    socket.off('status');
    socket.off('finished');
    d3.select('#osrmfiles')
    .html('');
      d3.select('#chosenFile')
    .html('');
  })
}

var osrmfile = './data/OSRM-ready/map.osrm';

function createOsrmList(osrmlist) {
  d3.select('#osrmfiles')
    .html('');
  d3.select('#chosenFile')
    .html('');
  if(window.location.search.split('?').length>1)
    osrmfile = window.location.search.split('?')[1].split('=')[1];
  var osrmtime;
  if(osrmfile.indexOf('maps')>-1) {
    osrmtime = osrmfile.split('/')[3];
  }
  osrmlist.forEach(function(osrm){
    var date = new Date(parseInt(osrm)*1000);
    if(osrm===osrmtime) {
      var result = '<span class="activeOSRM">using this file: Processing done on '+date.toLocaleString()+ '</span>';
      var pad = './data/maps/'+osrm+'/map.osrm';
      socket.emit('setOSRM',{osrm:pad});
      d3.select('#chosenFile')
        .insert('div')
        .html(result)
    }
    
      var result = 'Processing done on '+date.toLocaleString()+' - <span class="changeOSRM">use this file</span>';
      
      d3.select('#osrmfiles')
        .insert("div", ":first-child")
        .html(result)
        .on('click',function(){setOsrm(osrm)})
    
  });
}
function setOsrm(osrm) {
  var pad = './data/maps/'+osrm+'/map.osrm';
  window.history.pushState({},'calculate stats', 'calculate.html?osrm='+pad);
  socket.emit('setOSRM',{osrm:pad});
  createOsrmList(OSRMLIST);
}

var layer = new L.StamenTileLayer("toner-lite");
var map = new L.Map("map", {
    center: new L.LatLng(26.5,107.5),
    zoom: 8
});
map.addLayer(layer);

d3.select('#localLevel')
.on('change',function(e){
    map.removeLayer(regionalarea);
    map.removeLayer(provinialarea);
    map.addLayer(localarea);
})
d3.select('#prefectureLevel')
.on('change',function(e){
    map.addLayer(regionalarea);
    map.removeLayer(provinialarea);
    map.removeLayer(localarea);
})
d3.select('#provincialLevel')
.on('change',function(e){
    map.removeLayer(regionalarea);
    map.addLayer(provinialarea);
    map.removeLayer(localarea);
})

var localFile = '../data/ReadytoUse/Guizhou_county.min.geojson';
var regionalFile = '../data/ReadytoUse/prefectures.geojson';
var provincialFile = '../data/ReadytoUse/province.geojson';
var localarea;
var regionalarea;
var provinialarea;

d3.json(localFile,function (data) {
  localarea = L.geoJson(data, {
    style: function(feature){
      return {color:'#a6bddb',weight:1}
    },
    onEachFeature: function (feature, layer) {
      layer.on('click',function(e){
        generateCSV(feature,'NAME_3');
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
  localarea.addTo(map);
  map.fitBounds(localarea.getBounds());    
})
d3.json(regionalFile,function (data) {
  regionalarea = L.geoJson(data, {
    style: function(feature){
      return {color:'#a6bddb',weight:1}
    },
    onEachFeature: function (feature, layer) {
      layer.on('click',function(e){
        generateCSV(feature,'NAME_2');
      });
      layer.on('mousemove',function(e) {
        d3.select('#countyname')
          .html(feature.properties.NAME_2)
          .style({left:(e.originalEvent.layerX+15)+'px',top:(e.originalEvent.layerY+5)+'px'})
      })
      layer.on('mouseout',function(){
        d3.select('#countyname')
          .html('')
      })
    }
  });
})
d3.json(provincialFile,function (data) {
  provinialarea = L.geoJson(data, {
    style: function(feature){
      return {color:'#a6bddb',weight:1}
    },
    onEachFeature: function (feature, layer) {
      layer.on('click',function(e){
        generateCSV(feature,'NAME_3');
      });
      layer.on('mousemove',function(e) {
        d3.select('#countyname')
          .html(feature.properties.NAME_1)
          .style({left:(e.originalEvent.layerX+15)+'px',top:(e.originalEvent.layerY+5)+'px'})
      })
      layer.on('mouseout',function(){
        d3.select('#countyname')
          .html('')
      })
    }
  });
})

function generateCSV (feature,geometryId) {

   socket.emit('getMatrixForRegion',{feature:feature,id:new Date().getTime(),time:3600,maxSpeed:120,geometryId:feature.properties[geometryId]})
}

function createCsvList(csv) {
      var time = csv.split('-')[1].split('.')[0];
      var id = csv.split('-')[0];
      var date = new Date(parseInt(time));

      var result = '<td>Calculation done on '+date.toLocaleString()+' for '+id +': </td><td><a href="../data/csv/'+csv+'"> download CSV file</a> </td><td> <a href="analyse.html?csv=../data/csv/'+csv+'"> view statistics</a></td>';
      return result;
}