
var getAll = false;
var POIS = ['hospitals','schools','prefectures','banks','counties'];
var socket = io('http://localhost:5000');
 socket.on('status', function (data) {
    console.log(data);
});

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
 	console.log('disconnect');
 	if(getAll) {
	 	window.setTimeout(function () {
	 		console.log(runIdx);
	 		runIdx = runIdx -1;
	 		bigrun();
	 	},10000)
	 }
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