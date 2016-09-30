"use strict";
var PROJECT,
   CONNECTED = false,
   RESULTS = [],
   WALKSPEED = 3.6;

function validSocket(socket) {
    socket.on('config',function(c){
        viewProject(c.config,socket);
    });
    socket.on('resultJson',function(data){
        if(data.constructor === Array){
            console.log(data)
          addResult(data);
        }
    })
}
function inValidSocket(socket) {
    socket.off('config');    
    socket.off('resultJson');    
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
    socket.emit('retrieveResults',{project:project});

    var pDiv = d3.select('#projectInfo').html('');

    pDiv.append('h2').text(PROJECT.name);
    pDiv.append('span').text('created at '+ new Date(parseInt(PROJECT.created)))

}

function addResult(data) {
  var csv = getUrlVars()['csv'];
  if(csv)  setActiveResult(csv);
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

function setActiveResult(csv) {
    var pad = decodeURIComponent(csv);
    var time = pad.split('-')[1];
    var id = pad.split('-')[0];
    var nw = pad.split('-')[2].split('.')[0];
    var date = new Date(parseInt(time));

    var cDiv = d3.select('#activeResult').html('');
    cDiv.append('b').text(id + " created on " + date + " with " + nw);
    var file = '../data/'+PROJECT.uid+'/csv/'+pad;
    window.setTimeout(function(){
        queue()
        .defer(d3.csv, file)
        .await(createStats)
    },1000)  
} 

function createStats(err,data) {
    data.forEach(function(d,idx) {
        d.population  = +d[PROJECT.population];
        for(var key in PROJECT.pois) {
            d[key] = d3.round(((+d[key])+(+d.nearest/WALKSPEED))/60.,0);
        };
        
        d.lat = d3.round(+d.lat,6);
        d.lon = d3.round(+d.lon,6);
    });
    var normalised = data;
    var totalPop = normalised.reduce(function(p,c){return p+(+c[PROJECT.population])},0);
    PROJECT.stats.forEach(function(s) {
        var stat = normalised.reduce(function (p,c) { return c[s.poi]<s.minutes?p+(+c[PROJECT.population]):p;},0)*1000
        d3.select('#statsum').append('tr').append('td').text(Math.round(stat/totalPop)/10+'% of the population can reach '+s.poi +' in '+s.minutes +' minutes')
    })

    buildGraphs(normalised);
}
function accumulate_group(source_group) {
  return {
    all:function () {
      var cumulate = 0;
      var result = [];
      return source_group.all().map(function(d) {
        cumulate += d.value;
        return {key:d.key, value:cumulate};
      });
    } 
  };
}

function buildGraphs(data) {
    var facts,all;
    facts = crossfilter(data);  // Gets our 'facts' into crossfilter
    all = facts.groupAll();

    
    for(var poi in PROJECT.pois) {
        var id = '#'+poi+'Chart';
        d3.select('#graphs').append('div').attr('id',poi+'Chart');
        var chart = dc.barChart(id);    
        var value = facts.dimension(function(d){return d[poi]})
        var valueGroupSum = value.group()
            .reduceSum(function(d) { return d[PROJECT.population]; }); 
        
        var valueGroupCount = value.group()
            .reduceCount(function(d) { return d[poi]; }) // counts the number of the facts by hospitals
        var max = value.top(1)[0][poi];
        chart.width(480)
            .height(150)
            .margins({top: 10, right: 10, bottom: 20, left: 60})
            .dimension(value)                // the values across the x axis
            .group(accumulate_group(valueGroupSum))              // the values on the y axis
            .transitionDuration(500)
            .centerBar(true)
            .gap(56)                                            // bar width Keep increasing to get right then back off.
                .x(d3.scale.linear().domain([0, Math.min(max,360)]))
            .elasticY(true)
            .xAxis().tickFormat(function(v) {return v;});
      }
      dc.renderAll();
}