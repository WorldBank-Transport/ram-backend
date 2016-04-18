var OSRMLIST;
var socket;
d3.json('../data/user.json',function(d){
  Authenticate(d.user,d.pass);
})
var socket;
function Authenticate(user,pass) {
  var sockethost = window.location.protocol +'//'+ window.location.host;
  socket = io(sockethost);
  socket.on('connect', function(){
    socket.emit('authentication', {username: user, password: pass});
  });
  socket.on('unauthorized', function(err){
    alert($.i18n.prop('gnl_unauth'));
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
          .html($.i18n.prop('gnl_connected'))
          .style({color:'green','font-weight':'bold'})
      }
      else if(data.osrm) {
        console.log(data.osrm)
        OSRMLIST = data.osrm.map(function(o){return {file:o,active:false}});
        createOsrmList(OSRMLIST);
      }
      else if(data.file) {
        d3.select('#step4')
        .style('display','block');

        d3.select('#logfield')
          .insert("div", ":first-child")
          .html($.i18n.prop('cal_next'))
          .style({color:'green','font-weight':'bold'})
       
        d3.select('#csvlist')
          .insert("tr", ":first-child")
          .html(createCsvList(data.file))
      }
      else if(data.newOsrm) {
        highlightOsrm(data.newOsrm);
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
        .html($.i18n.prop('gnl_disconnected'))
        .style({color:'red','font-weight':'bold'})
    socket.off('status');
    socket.off('finished');
    d3.select('#osrmfiles')
    .html('');
      d3.select('#chosenFile')
    .html('');
  })
}


function createOsrmList(osrmlist) {
  d3.select('#osrmfiles')
    .html('');
  d3.select('#chosenFile')
    .html('');

  var osrmfile = getUrlVars()['osrm']===undefined?'./data/OSRM-ready/map.osrm':getUrlVars()['osrm'];

  osrmlist.forEach(function(item){
    var osrm = item.file;
    if(osrm === osrmfile) {
      if(!item.active)
      socket.emit('setOSRM',{osrm:osrm});
    item.active = true;
    }
    if(osrm.indexOf('maps')>-1) {
      var date = new Date(parseInt(osrm.split('/')[3])*1000);
    }
    var active = item.active?'active':'';
    var result = date?'<span class="'+active+'">'+$.i18n.prop('cal_osrm_file',osrm.split('/')[4], date.toLocaleString())+'</span> - <span class="changeOSRM">'+$.i18n.prop('cal_use_file')+'</span>':'<span class="'+active+'">'+$.i18n.prop('cal_default_osrm')+'</span> - <span class="changeOSRM">'+$.i18n.prop('cal_use_file')+'</span>';
    d3.select('#osrmfiles')
        .insert("div", ":first-child")
        .html(result)
        .on('click',function(){setOsrm(osrm)})
  })

}
function setOsrm(osrm) {
  var url = getUrlVars()['lang']===undefined?('calculate.html?osrm='+osrm):('calculate.html?osrm='+osrm+'&lang='+getUrlVars()['lang']);
  window.history.pushState({},'calculate stats', url);
  socket.emit('setOSRM',{osrm:osrm});
}

function highlightOsrm(osrm) {
  OSRMLIST.forEach(function(item){
    if(item.file===osrm) {
      item.active = true
    }
    else {
      item.active = false;
    }
  })
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

d3.json(localFile,function (data) {
  localarea = L.geoJson(data, {
    style: defaultStyle,
    onEachFeature: function (feature, layer) {
      layer.on('click',function(e){
        generateCSV(feature,'NAME_3');
      });
      layer.on('mousemove',function(e) {
        layer.setStyle( highlightStyle)
        d3.select('#countyname')
          .html(feature.properties.NAME_3)
          .style({left:(e.originalEvent.layerX+15)+'px',top:(e.originalEvent.layerY+5)+'px'})
      })
      layer.on('mouseout',function(){
        layer.setStyle(defaultStyle);
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
    style: defaultStyle,
    onEachFeature: function (feature, layer) {
      layer.on('click',function(e){
        generateCSV(feature,'NAME_2');
      });
      layer.on('mousemove',function(e) {
        layer.setStyle( highlightStyle)
        d3.select('#countyname')
          .html(feature.properties.NAME_2)
          .style({left:(e.originalEvent.layerX+15)+'px',top:(e.originalEvent.layerY+5)+'px'})
      })
      layer.on('mouseout',function(){
        layer.setStyle(defaultStyle);
        d3.select('#countyname')
          .html('')
      })
    }
  });
})
d3.json(provincialFile,function (data) {
  provinialarea = L.geoJson(data, {
    style: defaultStyle,
    onEachFeature: function (feature, layer) {
      layer.on('click',function(e){
        generateCSV(feature,'NAME_1');
      });
      layer.on('mousemove',function(e) {
        layer.setStyle( highlightStyle)
        d3.select('#countyname')
          .html(feature.properties.NAME_1)
          .style({left:(e.originalEvent.layerX+15)+'px',top:(e.originalEvent.layerY+5)+'px'})
      })
      layer.on('mouseout',function(){
        layer.setStyle(defaultStyle);
        d3.select('#countyname')
          .html('')
      })
    }
  });
})

function generateCSV (feature,geometryId) {
  var osrm = OSRMLIST.filter(function(o){return o.active});
   socket.emit('getMatrixForRegion',{feature:feature,id:new Date().getTime(),time:3600,maxSpeed:120,osrm:osrm[0].file,geometryId:feature.properties[geometryId]})
}

function createCsvList(csv) {
  var time = csv.split('-')[1].split('.')[0];
  var id = csv.split('-')[0];
  var nw = csv.split('-')[2];
  var date = new Date(parseInt(time));

  var result = '<td>'+$.i18n.prop("cal_done",date.toLocaleString(),id) +': </td><td><a href="../data/csv/'+csv+'"> '+$.i18n.prop("cal_download")+'</a> </td><td> <a href="analyse.html?csv=../data/csv/'+csv+'"> '+$.i18n.prop("cal_view")+'</a></td>';
  return result;
}