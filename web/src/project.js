"use strict";
var PROJECT,
   CONNECTED = false,
   RESULTS = [],
   MAP,
   uploader,
   quint=5;
//called when the socket is authenticated
function validSocket(socket) {
  uploader = new SocketIOFileUpload(socket);
  socket.on('config',function(c){
      viewProject(c.config,socket);
  });
  socket.on('osrmList',function(data){
      createOsrmList(data,socket);
  })
  socket.on('resultJson',function(data){
    if(data.result !== undefined)
      addResult(data);
  })
  socket.on('newOsrm',function (data) {
    PROJECT.activeOSRM = data.newOsrm;
    createActiveOsrm();
  })
  socket.on('removedOsrm',function(data){
    socket.emit('retrieveOSRM',{project:PROJECT.uid});
  })
  socket.on('uploadComplete',function(data){
    socket.emit('unzip',{project:PROJECT.uid,file:data.file,osrm:PROJECT.activeOSRM})
  })
 
}

function inValidSocket(socket) {
    socket.off('config');
    socket.off('osrmList');
    socket.off('resultJson');
    socket.off('newOsrm');
    socket.off('removedOsrm');
    socket.off('uploadComplete');
    uploader.destroy();
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

    if(PROJECT.levels && PROJECT.levels.length >0&&!CONNECTED){
        createLevelSelector(PROJECT.levels,socket);
    }

    uploader.listenOnSubmit(document.getElementById("uploadButton"), document.getElementById("file_input"));
    uploader.addEventListener('start',function(e){
    d3.select('#logfield')
      .insert("div", ":first-child")
      .html()
    })
    uploader.addEventListener('progress',function(e){
      var progress= Math.round(e.bytesLoaded / e.file.size*100);
      if(progress > quint) {
        d3.select('#logfield')
          .insert("div", ":first-child")
          .html($.i18n.prop('upl_progress',progress));
        quint=quint+10;
      }
    })
    uploader.addEventListener('complete',function (e) {
      d3.select('#logfield')
        .insert("div", ":first-child")
        .html($.i18n.prop('upl_process',e.file.name));
      d3.select('#logfield')
        .insert("div", ":first-child")
        .html($.i18n.prop('upl_patience'))
        .style({color:'orange','font-weight':'bold'});  
      quint = 5;
    })



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
function changeOsrm(data,socket) {
   socket.emit('setOSRM',{project:PROJECT.uid,osrm:data})
}

function removeOsrm(data,socket) {
  d3.event.stopPropagation();
  socket.emit('removeOsrm',{project:PROJECT.uid,osrm:data})
}
function createOsrmList(data,socket) {
  var nDiv = d3.select('#networkFiles').html('');

  var osrmDiv = nDiv.append('div')
    .selectAll('div')
    .data(data.osrm)
    .enter()
    .insert('div',":first-child").attr('class','checkbox')

  var labelDiv= osrmDiv.append('label');

  labelDiv.append('input')
    .attr('type','radio')
    .attr('class','osrmButtons')
    .attr('name','osrm')
    .attr('value',function(d){ return d.created.time})
    .on('change',function(d){changeOsrm(d,socket)});

  labelDiv
    .append('span')
    .text(function (d) {return ' '+d.name});

  labelDiv.append('span')
    .text(function (d) { return ' created at ' + new Date(parseInt(d.created.time))});

  osrmDiv.append('span')
    .attr('class','btn btn-default glyphicon glyphicon-remove')
    .on('click',function(d){removeOsrm(d,socket)})
    
  var baseDiv =nDiv.insert('div',':first-child').attr('class','checkbox').append('label');

  baseDiv.append('input')
    .attr('type','radio')
    .attr('checked',true)
    .attr('class','osrmButtons')
    .attr('name','osrm')
    .attr('value',function(d){return 'baseline';})
    .on('change',function(d){changeOsrm(PROJECT.baseline,socket);});

  baseDiv
    .append('span')
    .text(' baseline')
    .append('span')
    .text( ' created at ' + new Date(parseInt(PROJECT.baseline.created.time)));

  nDiv.insert('h2',':first-child').text('available network files:');
    
  nDiv.append('div')
    .attr('class','btn btn-default')
    .text('add new network')  
    .on('click',function(){createNewOsrm(socket)})  

  createActiveOsrm();
}
function createNewOsrm(socket) {
   var newDiv = d3.select('#addNetwork');
   newDiv.style('height','auto');
   var upload = d3.select('#uploadNetwork');
   var change = d3.select('#changeNetwork');

   d3.select('#btnChangeNetwork')
   .on('click',function (d) {
     upload.style('height','0px');
     change.style('height','auto');
   })
   d3.select('#btnUploadNetwork')
   .on('click',function (d) {
     change.style('height','0px');
     upload.style('height','auto');
   })

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
    
    d3.select('#results')
      .selectAll('div')
      .data(RESULTS)
      .enter()
      .append('div')
      .text(function(d){return d.name})
}