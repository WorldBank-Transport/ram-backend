
var getAll = false;
var POIS = ['hospitals','schools','prefectures','banks','counties'];
var socket = io('http://localhost:5000');
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

});
function createCsvList(csv) {
      var time = csv.split('-')[2].split('.')[0];
      var id = csv.split('-')[0];
      var date = new Date(parseInt(time));

      var result = '<td>Calculation done on '+date.toLocaleString()+' for ID '+id +': </td><td><a href="data/csv/'+csv+'">download CSV file</a> </td><td> <a href="plots/index.html?csv=../data/csv/'+csv+'">view statistics</a></td>';
      return result;
}
socket.on('finished',function(data){
 	console.log('finished');
 	if(!data||!data.type) throw('data and type are required');
 	if(data.type == 'isochrone') {
 		
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

socket.on('disconnect',function(){
      d3.select('#logfield')
          .insert("div", ":first-child")
          .html('disconnected, hang on trying again in a few seconds')
          .style({color:'red','font-weight':'bold'})
})

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