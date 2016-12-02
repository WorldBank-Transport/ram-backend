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
    if(data.constructor === Array){            
      addResult(data);
    }
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
  socket.on('csvMetaFinished',function(data){
    socket.emit('retrieveResults',{project:PROJECT.uid});
  })
  socket.on('csvFinished',function(data){
    
  })
  d3.select('#addnetwork')
    .on('click',function(){createNewOsrm(socket)})  
}

function inValidSocket(socket) {
    socket.off('config');
    socket.off('osrmList');
    socket.off('resultJson');
    socket.off('newOsrm');
    socket.off('removedOsrm');
    socket.off('uploadComplete');
    socket.off('csvFinished');
    socket.off('csvMetaFinished');
    uploader.destroy();
    d3.select('#addnetwork')
      .on('click',null)  
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
      d3.select('#addNetwork')
      .style('height','0px');
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

  d3.selectAll('.osrmButtons')
  .attr('checked',null);
  d3.select('#cx_'+PROJECT.activeOSRM.uid)
  .attr('checked',"checked")
 
}
function changeOsrm(data,socket) {
   socket.emit('setOSRM',{project:PROJECT.uid,osrm:data})
}

function removeOsrm(data,socket) {
  d3.event.stopPropagation();
  socket.emit('removeOsrm',{project:PROJECT.uid,osrm:data})
}
function createOsrmList(data,socket) {
  d3.select('#networkFiles').html('');
  var row = d3.select('#networkFiles')
    .selectAll('tr')
    .data(data.osrm,function(d) { 
      return d.created.time; })
    .enter()
    .insert('tr')
    .attr('class','osrm')
    .on('click',function (d) {changeOsrm(d,socket)})

  row.append('td')
    .append('span')
    .attr('class','checkbox-inline')
    .append('input')
    .attr('type','radio')
    .attr('class','osrmButtons')
    .attr('name','osrm')
    .attr('id',function(d){return 'cx_'+d.uid})
    .attr('value',function(d){ return d.created.time})
    .on('change',function(d){changeOsrm(d,socket)});

  row.append('td')
   .text(function (d) {return ' '+d.name});

  row.append('td')
    .text(function (d) { return ' created at ' + new Date(parseInt(d.created.time))});
  
  row.append('td')
    .append('span')
    .attr('class','btn btn-danger btn-xs glyphicon glyphicon-remove')
    .on('click',function(d){removeOsrm(d,socket)})

  d3.select('#networkFiles')
    .selectAll('tr')
    .data(data.osrm,function(d) { 
      return d.created.time; })
    .exit().remove();
  
  d3.select('#networkFiles').selectAll('tr')
    .sort(function(a,b){
      if(a.created.time > b.created.time) {
        return -1;
      }
      if(a.created.time < b.created.time) {
        return 1;
      }
      return 0;
    });


  var baseRow =d3.select('#networkFiles').insert('tr',':first-child')
  .on('click',function () {
    changeOsrm(PROJECT.baseline,socket)
  });
  
  baseRow.append('td') 
    .append('span')
    .attr('class','checkbox-inline')
    .append('input')
    .attr('type','radio')
    .attr('class','osrmButtons')
    .attr('name','osrm')
    .attr('id',function(d){return 'cx_'+PROJECT.baseline.uid})
    .attr('value','baseline')
    .on('change',function(){changeOsrm(PROJECT.baseline,socket);});

  baseRow.append('td')
   .text('baseline');

  baseRow.append('td')
    .text(new Date(parseInt(PROJECT.baseline.created.time)));
  
    
 

  createActiveOsrm();
}


  // We can attach the `fileselect` event to all file inputs on the page
  $(document).on('change', ':file', function() {
    var input = $(this),
        numFiles = input.get(0).files ? input.get(0).files.length : 1,
        label = input.val().replace(/\\/g, '/').replace(/.*\//, '');
    input.trigger('fileselect', [numFiles, label]);
  });

  // We can watch for our custom `fileselect` event like this
  $(document).ready( function() {
      $(':file').on('fileselect', function(event, numFiles, label) {

          var input = $(this).parents('.input-group').find(':text'),
              log = numFiles > 1 ? numFiles + ' files selected' : label;

          if( input.length ) {
              input.val(log);
              $('#uploadButton')
              .removeClass('disabled')

          } else {
              if( log ) alert(log);
          }
 
      });
  });

function createNewOsrm(socket) {
  var newDiv = d3.select('#addNetwork');
  if(newDiv.style('max-height') !== '0px') {
    
    newDiv.style('max-height','0px');
    
  }
  else {
    newDiv.style('height','auto');
    newDiv.style('max-height','200px');

  }

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
        d.area.bindTooltip(          
          function(f){
          var ele = d3.selectAll('#levelSelector>div>label>input').filter(function(d,i){return this.checked}).data();
          return f.feature.properties[ele[0].geometryId]
        }).openTooltip();
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
        d.area.bindTooltip(function(f){
          var ele = d3.selectAll('#levelSelector>div>label>input').filter(function(d,i){return this.checked}).data();
          return f.feature.properties[ele[0].geometryId]
        }).openTooltip();
      }
      CONNECTED =true;
    })


}

function generateCSV (feature,geometryId,socket) {
    socket.emit('getMatrixForRegion',{project:PROJECT.uid,feature:feature,id:new Date().getTime(),geometryId:feature.properties[geometryId]})
}

function addResult(data) {
  RESULTS = data;
  
  var row = d3.select('#results')
    .selectAll('tr')
    .data(RESULTS)
    .enter()
    .insert("tr", ":first-child")

  row.append('td')
    .text(function(d){return d.result.name});
  row.append('td')
    .append('a')
    .attr('href',function(d){ return '../data/'+PROJECT.uid+'/csv/'+d.result.csvfile})
    .text('Download result');
  row.append('td')
    .append('a')
    .attr('href',function(d){ return 'result.html?project='+PROJECT.uid+'&csv='+d.result.csvfile})
    .text('View result');
  
}