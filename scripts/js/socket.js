var socket;
d3.json('../data/user.json',function(d){
  Authenticate(d.user,d.pass);
})
var socket;
function Authenticate(user,pass) {
  var sockethost = window.location.protocol +'//'+ window.location.host;
  socket = io(sockethost);
  var uploader = new SocketIOFileUpload(socket);
  uploader.listenOnInput(document.getElementById("siofu_input"));
  uploader.addEventListener('complete',function (e) {
    console.log(e);
  })
  socket.on('connect', function(){
    socket.emit('authentication', {username: user, password: pass});
  });
  socket.on('unauthorized', function(err){
    alert('not a valid username or password, please try again.');
  });
  socket.on('authenticated', function() {
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
      else if(data.csvs) {
            console.log(data.csvs);
          d3.select('#csvlist')
          .selectAll("tr")
          .data(data.csvs)
          .enter()
          .insert('tr',":first-child")
          .html(createCsvList)
      }
      else if(data.file) {
          d3.select('#csvlist')
          .insert("tr", ":first-child")
          .html(createCsvList(data.file))
      }
      else if(data.result) {
        var pad = data.result.split('\n')[0];
        socket.emit('setOSRM',{osrm:pad});
      }
    });
    socket.on('finished',function(data){
      console.log('finished');
      if(!data||!data.type) throw('data and type are required');
      if(data.type == 'isochrone') {
        console.log('isochrone');
        var isochrone = L.geoJson(data.data).addTo(map);

      }
      if(data.type == 'poilist') {
        listRecieved(data.data.features.map(function (d) {
          return d.properties;
        }))
        
        if(getAll) {
          bigrun();
        }
      }
    })
  })


  socket.on('disconnect',function(){
    d3.select('#logfield')
        .insert("div", ":first-child")
        .html('disconnected, hang on trying again in a few seconds')
        .style({color:'red','font-weight':'bold'})
    socket.off('status');
    socket.off('finished');

  })
}


function getPoiPop(features,poi,time) {
 	var inside = features.filter(function(f){return f.properties[poi] <=time && f.properties[poi]!==null});
 	return inside.reduce(function(prev,cur){return prev + cur.properties.POP},0);
}

var lijst = [];
function listRecieved(list) {

      list.forEach(function(item){
      	var tmp =[];
      	if(lijst.length===0) {
      		var tmp2 = []
      		for (var key in item) {
      			tmp2.push(key);
      		}
      	
      		lijst.push(d3.csv.formatRows([tmp2]));
      	}
      	for (var key in item) {
      		  if (item.hasOwnProperty(key)) {
      		var obj = item[key];
      		tmp.push(obj);
      	  }
      	}
      	lijst.push(d3.csv.formatRows([tmp]));
      })
      var print = lijst.reduce(function (prev,cur) {
            return prev + '</br>' + cur;
      },'')
      d3.select('#csv').html(print);
}
function createCsvList(csv) {
      var time = csv.split('-')[1].split('.')[0];
      var id = csv.split('-')[0];
      var date = new Date(parseInt(time));

      var result = '<td>Calculation done on '+date.toLocaleString()+' for ID '+id +': </td><td><a href="data/csv/'+csv+'">download CSV file</a> </td><td> <a href="plots/index.html?csv=../data/csv/'+csv+'">view statistics</a></td>';
      return result;
}