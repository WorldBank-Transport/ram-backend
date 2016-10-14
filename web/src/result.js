"use strict";
var PROJECT,
   CONNECTED = false,
   RESULTS = [],
   WALKSPEED = 3.6,
   volumeByPopulation,
   COMPARELIST = [],
   COMPARECOUNTER = [];

function validSocket(socket) {
    socket.on('config',function(c){
        viewProject(c.config,socket);
    });
    socket.on('resultJson',function(data){
        if(data.constructor === Array){
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
   var l = row.append('td')
    .append('div')
    .attr('class','checkbox-inline')
    .append('label');
    l.append('input')
    .attr('class','compareButtons')
    .attr('type','checkbox')
    .attr('value',function (d) { return d.result.csvfile})    
    .on('click',function(d){compareButtons(this,d)});
    l.append('span')
    .text($.i18n.prop('anl_compare'))
    
}
function compareButtons(e,c){
  var file = '../data/'+c.project+'/csv/'+c.result.csvfile;
  if(e.checked) {
    d3.csv(file,function(data){
      var normal = normaliseCsv(data);
      COMPARELIST.push({file:file,data:normal,uid:c.result.created.time,name:c.result.name})
      COMPARECOUNTER.push(c.result.created.time);
      createCompareTable();
    })
  }   
  else {
    COMPARELIST.splice(COMPARECOUNTER.indexOf(c.result.created.time),1);
    COMPARECOUNTER.splice(COMPARECOUNTER.indexOf(c.result.created.time),1);
    createCompareTable();
  }
  
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

function normaliseCsv(data) {  
  data.forEach(function(d,idx) {
    d.population  = +d[PROJECT.population];
    for(var key in PROJECT.pois) {
      d[key] = d3.round(((+d[key])+(+d.nearest/WALKSPEED))/60.,0);
    };
    d.lat = d3.round(+d.lat,6);
    d.lon = d3.round(+d.lon,6);
  });
  return data;
}

function createStats(err,data) {
    if(err) throw err;
    var normalised = normaliseCsv(data);
    var totalPop = normalised.reduce(function(p,c){return p+(+c[PROJECT.population])},0);
    PROJECT.stats.forEach(function(s) {
        var stat = normalised.reduce(function (p,c) { return c[s.poi]<s.minutes?p+(+c[PROJECT.population]):p;},0)*1000
        d3.select('#statsum').append('tr').append('td').text(Math.round(stat/totalPop)/10+'% of the population can reach '+s.poi +' in '+s.minutes +' minutes')
    })

    buildGraphs(normalised);
}

d3.select('#travelTime').on('input',function(d){
  createCompareTable(this.value);
})
function createCompareTable(minute){
if(minute === undefined) minute = +$('#travelTime').val();
  $('#anl_slider_txt').html($.i18n.prop('anl_slider_txt',minute));
  var list = [];
  COMPARELIST.forEach(function(item){
    var listitem = {};
    var data = item.data;
    listitem.name = item.name;
    listitem.total = data.reduce(function(p,c){return p+c.population},0)
    PROJECT.stats.forEach(function(d){
      listitem[d.poi] = data.reduce(function(p,c){
        return c[d.poi]<=minute?p+c.population:p
      },0);
    })
    list.push(listitem)
  })


  d3.select('#statcomp').html('');
  d3.select('#statcomphead').html('');
  if(list.length>0) {
  var head = d3.select('#statcomphead');
  head.append('th').text('file');
  var row = d3.select('#statcomp')
    .selectAll('tr')
    .data(list)
    .enter()
    .insert("tr")

  row.append('td')
    .text(function(d){
      return d.name
    });
  PROJECT.stats.forEach(function(d){
    row.append('td')
      .text(function(a) {
        return Math.round(+a[d.poi]/a.total*1000)/10
      })
    head.append('th')
      .text(function(a) {
        return d.poi;
      })
  });
  }
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
    dc.dataCount(".dc-data-counts")
    .dimension(facts)
    .group(all);

    

    for(var poi in PROJECT.pois) {
        var id = '#'+poi+'Chart';
        d3.select('#graphs').append('div').attr('id',poi+'ChartSpace')
        .attr('class','col-md-6 col-md-offset-0 col-sm-offset-4 col-sm-8 col-xs-12')
        .append('h3')
        .text(poi);

        d3.select(id+'Space').append('div').attr('id',poi+'Chart');
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
     d3.select('#graphs').append('div').attr('id','populationChartSpace')
        .attr('class','col-md-6 col-md-offset-0 col-sm-offset-4 col-sm-8 col-xs-12')
        .append('h3')
        .text('Population');

    d3.select('#populationChartSpace').append('div').attr('id','populationChart');
    var populationChart = dc.barChart("#populationChart");
    var populationDimension = facts.dimension(function (d) {
        return d.population;
    }); 
    var populationGroupSum = populationDimension.group()
        .reduceSum(function(d) { return d.population; });
    volumeByPopulation = facts.dimension(function(d) {
        return (d.population);
    });
    var volumeByPopulationCount = volumeByPopulation.group()
    .reduceCount(function(d) { return d.population; });
    var volumeByPopulationGroup = volumeByPopulation.group()
      .reduceSum(function(d) { return d.population; });
    var maxPopulation = volumeByPopulation.top(1)[0].population;

    populationChart.width(480)
        .height(150)
        .margins({top: 10, right: 10, bottom: 20, left: 60})
        .dimension(volumeByPopulation)
        .group(volumeByPopulationCount)
        .transitionDuration(500)
        .elasticY(true)
        .x(d3.scale.log().domain([10, maxPopulation])) // scale and domain of the graph
        .xAxis().ticks(10, ",.0f").tickSize(5, 0);


      dc.renderAll();
}
d3.select('#anl_export')
  .on('click',function(d){
    var filename = $('#fileName').val();
    if(filename==='') {
      filename = 'export.csv';
    }
    if(filename.toLowerCase().slice(-4)!=='.csv'){
      filename = filename + '.csv';
    }
    exportCSV(filename);
  })

function exportCSV(filename) {
  var villages = volumeByPopulation.top(Infinity);
  var csvFile = d3.csv.format(villages)
  var blob = new Blob([csvFile], { type: 'text/csv;charset=utf-8;' });
  if (navigator.msSaveBlob) { // IE 10+
    navigator.msSaveBlob(blob, filename);
  } else {
    var link = document.createElement("a");
    if (link.download !== undefined) { // feature detection
      // Browsers that support HTML5 download attribute
      var url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  }
}