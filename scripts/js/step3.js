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
       else if(data.csvs) {
            console.log(data.csvs);
          d3.select('#csvlist')
          .selectAll("tr")
          .data(data.csvs)
          .enter()
          .insert('tr',":first-child")
          .html(createCsvList);

           d3.selectAll('.changeOSRM')
          .on('click',function(){
            selectStats(this);
          })

          d3.selectAll('.compareButtons')
          .on('click',function(){
            compareStats(this);
          })
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

var compareList = [];
var statList = [];
function compareStats(el) {
  if(el.checked) {
    var value = el.value;
    d3.csv('../data/csv/'+el.value,function(normal){
      normal.forEach(function(d,idx) {
      d.population  = +d.POP;
      d.banks   = d3.round((+d.banks)/60.,0);
      d.hospitals = d3.round((+d.hospitals)/60.,0);
      d.schools = d3.round((+d.schools)/60.,0);
      d.counties = d3.round((+d.counties)/60.,0);
      d.prefectures = d3.round((+d.prefectures)/60.,0);
      d.county= d.NAME_3;
      d.lat = d3.round(+d.lat,6);
      d.lon = d3.round(+d.lon,6);
    });

    var data = normal;

    var ssPop = data.reduce(function(p,c){return p+c.population},0)
    var c60min = data.reduce(function(p,c){if (c.counties <=60) {
      return p+c.population}
      else return p;
      },0);
    var h30min = data.reduce(function(p,c){if (c.hospitals <=30) {
      return p+c.population}
      else return p;
      },0);
    var b30min = data.reduce(function(p,c){if (c.banks <=30) {
      return p+c.population}
      else return p;
      },0);
    var s20min = data.reduce(function(p,c){if (c.schools <=20) {
      return p+c.population}
      else return p;
      },0);
    compareList.push(value)
    statList.push({file:value,total:ssPop,county:c60min,hospital:h30min,banks:b30min,school:s20min})
    createTable(statList)
    })

  }
  else {
    statList.splice(compareList.indexOf(el.value),1)
    compareList.splice(compareList.indexOf(el.value),1);
    createTable(statList)
  }
 
}

function createTable(list) {
  d3.select('#comstats').html('');
  if(list.length>0) {
 d3.select('#comstats')
 //.html('<tr><th>file</th><th>% 60m county</th><th>% 30m hospital</th><th>% 30 min bank</th><th>% 20 min school</th></tr>')
 .selectAll('tr')
 .data(list)
 .enter()
 .append('tr')
 .html(function(d){
    return '<td>'+d.file+'</td><td>'+Math.round(d.county/d.total*1000)/10+'</td><td>'+Math.round(d.hospital/d.total*1000)/10+'</td><td>'+Math.round(d.banks/d.total*1000)/10+'</td><td>'+Math.round(d.school/d.total*1000)/10+'</td><td>'
 });  


 d3.select('#comstats')
 .insert("tr", ":first-child")
 .html('<th>file</th><th>% 60m county</th><th>% 30m hospital</th><th>% 30 min bank</th><th>% 20 min school</th>')
   }
}


function createCsvList(csv) {
      var time = csv.split('-')[csv.split('-').length-1].split('.')[0];
      var id = csv.split('-')[0];
      var date = new Date(parseInt(time));

      var result = '<td>Calculation done on '+date.toLocaleString()+' for '+id +': </td><td><a href="../data/csv/'+csv+'"> download CSV file</a> </td><td> <span class="changeOSRM" name="'+csv+'"> view statistics</span></td><td><div class="checkbox"><label><input type="checkbox" class="compareButtons" value="'+csv+'">compare</label></div></td>';
     
      return result;

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

function selectStats(el) {
  var file = el.attributes['name'].value;
  var pad = '../data/csv/'+file;
  window.history.pushState({},'analyse stats', 'analyse.html?csv='+pad);
  createStats(pad);
}
var csvfile;
if(window.location.search.split('?').length>1) {
    csvfile = window.location.search.split('?')[1].split('=')[1];
    createStats(csvfile)
  }

function createStats(pad) {
  var time = pad.split('-')[pad.split('-').length-1].split('.')[0];
  var id = pad.split('-')[0].split('/')[pad.split('-')[0].split('/').length-1];
  var date = new Date(parseInt(time));
  d3.select('#chosenFile').html('Showing statistics done on '+date.toLocaleString()+' for '+decodeURIComponent(id));
  d3.select('#step2').style('display','block');

queue()
.defer(d3.csv, pad)
.await(buildGraphs)
}  



var facts,all, hospitalsValue,volumeByPopulation;
function buildGraphs(err,normal) {

    normal.forEach(function(d,idx) {
      d.population  = +d.POP;
      d.banks   = d3.round((+d.banks)/60.,0);
      d.hospitals = d3.round((+d.hospitals)/60.,0);
      d.schools = d3.round((+d.schools)/60.,0);
      d.counties = d3.round((+d.counties)/60.,0);
      d.prefectures = d3.round((+d.prefectures)/60.,0);
      d.county= d.NAME_3;
      d.lat = d3.round(+d.lat,6);
      d.lon = d3.round(+d.lon,6);
    });

    var data = normal;

    var ssPop = data.reduce(function(p,c){return p+c.population},0)
    var c60min = data.reduce(function(p,c){if (c.counties <=60) {
      return p+c.population}
      else return p;
      },0)*1000;
    var h30min = data.reduce(function(p,c){if (c.hospitals <=30) {
      return p+c.population}
      else return p;
      },0)*1000;
    var b30min = data.reduce(function(p,c){if (c.banks <=30) {
      return p+c.population}
      else return p;
      },0)*1000;
    var s20min = data.reduce(function(p,c){if (c.schools <=20) {
      return p+c.population}
      else return p;
      },0)*1000;

    d3.select('#ssCounty').html(Math.round(c60min/ssPop)/10+' % of the population can reach a county seat by road in 60 minutes;');
    d3.select('#ssHospital').html(Math.round(h30min/ssPop)/10+' % of the population can reach a hospital by road in 30 minutes;');
    d3.select('#ssBank').html(Math.round(b30min/ssPop)/10+' % of the population can reach a bank by road in 30 minutes;');
    d3.select('#ssSchool').html(Math.round(s20min/ssPop)/10+' % of the population can reach a school seat by road in 20 minutes;');
/******************************************************
* Step1: Create the dc.js chart objects & ling to div *
******************************************************/

  var populationChart = dc.barChart("#dc-population-chart");
  var hospitalChart = dc.barChart("#dc-hospital-chart");
  var bankChart = dc.barChart("#dc-bank-chart");
  var schoolsChart = dc.barChart("#dc-schools-chart");
  var prefecturesChart = dc.barChart("#dc-prefectures-chart");
  var countiesChart = dc.barChart("#dc-counties-chart");
  var dataTable = dc.dataTable("#dc-table-graph");
  var isCountyChart = dc.rowChart("#dc-county-chart");

/****************************************
*   Run the data through crossfilter    *
****************************************/

  facts = crossfilter(data);  // Gets our 'facts' into crossfilter
  all = facts.groupAll();

/******************************************************
* Create the Dimensions                               *
* A dimension is something to group or filter by.     *
* Crossfilter can filter by exact value, or by range. *
******************************************************/

// count all the facts
dc.dataCount(".dc-data-count")
  .dimension(facts)
  .group(all);

// for Magnitude -> hospitals
hospitalsValue = facts.dimension(function (d) {
    return d.hospitals;       // group or filter by hospitals
  });
 
  var hospitalsValueGroupSum = hospitalsValue.group()
    .reduceSum(function(d) { return d.population; }); // sums the magnitudes per hospitals
  var hospitalsValueGroupCount = hospitalsValue.group()
    .reduceCount(function(d) { return d.hospitals; }) // counts the number of the facts by hospitals
  var maxHospital = hospitalsValue.top(1)[0].hospitals;

  var banksValue = facts.dimension(function (d) {
    return d.banks;       // group or filter by magnitude
  });
  var banksValueGroupSum = banksValue.group()
    .reduceSum(function(d) { return d.population; }); // sums the magnitudes per banks
  var banksValueGroupCount = banksValue.group()
    .reduceCount(function(d) { return d.banks; }) // counts the number of the facts by banks
  var maxBanks = banksValue.top(1)[0].banks;

  var prefecturesValue = facts.dimension(function (d) {
    return d.prefectures;       // group or filter by magnitude
  });
  var prefecturesValueGroupSum = prefecturesValue.group()
    .reduceSum(function(d) { return d.population; }); // sums the magnitudes per counties
  var prefecturesValueGroupCount = prefecturesValue.group()
    .reduceCount(function(d) { return d.prefectures; }) // counts the number of the facts by counties
  var maxPrefectures = prefecturesValue.top(1)[0].prefectures;

  var countiesValue = facts.dimension(function (d) {
    return d.counties;       // group or filter by magnitude
  });
  var countiesValueGroupSum = countiesValue.group()
    .reduceSum(function(d) { return d.population; }); // sums the magnitudes per counties
  var countiesValueGroupCount = countiesValue.group()
    .reduceCount(function(d) { return d.counties; }) // counts the number of the facts by counties
  var maxCounties = countiesValue.top(1)[0].counties;

  var schoolsValue = facts.dimension(function (d) {
    return d.schools;       // group or filter by magnitude
  });
  var schoolsValueGroupSum = schoolsValue.group()
    .reduceSum(function(d) { return d.population; }); // sums the magnitudes per counties
  var schoolsValueGroupCount = schoolsValue.group()
    .reduceCount(function(d) {
      return d.schools; })
      // counts the number of the facts by counties
  var maxSchools = schoolsValue.top(1)[0].schools;

  //For Counties. Pie Chart
  var isCounty = facts.dimension(function (d) {
    return d.county;
    });
  var isCountyGroup = isCounty.group();

  // For datatable
  var populationDimension = facts.dimension(function (d) {
    return d.population;
  }); // group or filter by time
  var populationGroupSum = populationDimension.group()
    .reduceSum(function(d) { return d.population; });

  /*// for Depth
  var depthValue = facts.dimension(function (d) {
    return d.depth;
  });
  var depthValueGroup = depthValue.group();
*/
  // define a daily volume Dimension
  volumeByPopulation = facts.dimension(function(d) {
    return (d.population);
  });
  // map/reduce to group sum
  var volumeByPopulationCount = volumeByPopulation.group()
    .reduceCount(function(d) { return d.population; });
  var volumeByPopulationGroup = volumeByPopulation.group()
      .reduceSum(function(d) { return d.population; });
  var maxPopulation = volumeByPopulation.top(1)[0].population;






/***************************************
*   Step4: Create the Visualisations   *
***************************************/

  // hospitalChart Bar Graph Summed
  hospitalChart.width(480)
    .height(150)
    .margins({top: 10, right: 10, bottom: 20, left: 60})
    .dimension(hospitalsValue)                // the values across the x axis
    .group(accumulate_group(hospitalsValueGroupSum))              // the values on the y axis
//      .group(hospitalsValueGroupSum)              // the values on the y axis
  .transitionDuration(500)
    .centerBar(true)
  .gap(56)                                            // bar width Keep increasing to get right then back off.
    .x(d3.scale.linear()
    .domain([0, maxHospital]))
  .elasticY(true)
  .xAxis().tickFormat(function(v) {return v;});

  bankChart.width(480)
    .height(150)
    .margins({top: 10, right: 10, bottom: 20, left: 60})
    .dimension(banksValue)                // the values across the x axis
    .group(accumulate_group(banksValueGroupSum))              // the values on the y axis
  .transitionDuration(500)
    .centerBar(true)
  .gap(56)                                            // bar width Keep increasing to get right then back off.
    .x(d3.scale.linear().domain([0, maxBanks]))
  .elasticY(true)
  .xAxis().tickFormat(function(v) {return v;});

  schoolsChart.width(480)
    .height(150)
    .margins({top: 10, right: 10, bottom: 20, left: 60})
    .dimension(schoolsValue)  // the values across the x axis
    .group(accumulate_group(schoolsValueGroupSum)) // the values on the y axis
  .transitionDuration(500)
    .centerBar(true)
  .gap(56)                                            // bar width Keep increasing to get right then back off.
    .x(d3.scale.linear().domain([0, maxSchools]))
  .elasticY(true)
  .xAxis().tickFormat(function(v) {return v;});

  prefecturesChart.width(480)
    .height(150)
    .margins({top: 10, right: 10, bottom: 20, left: 60})
    .dimension(prefecturesValue)                // the values across the x axis
    .group(accumulate_group(prefecturesValueGroupSum))              // the values on the y axis
  .transitionDuration(500)
    .centerBar(true)
  .gap(56)                                            // bar width Keep increasing to get right then back off.
    .x(d3.scale.linear().domain([0, maxPrefectures]))
  .elasticY(true)
  .xAxis().tickFormat(function(v) {return v;});


  countiesChart.width(480)
    .height(150)
    .margins({top: 10, right: 10, bottom: 20, left: 60})
    .dimension(countiesValue)               // the values across the x axis
    .group(accumulate_group(countiesValueGroupSum))             // the values on the y axis
  .transitionDuration(500)
    .centerBar(true)
  .gap(56)                                            // bar width Keep increasing to get right then back off.
    .x(d3.scale.linear().domain([0, maxCounties]))
  .elasticY(true)
  .elasticX(true)
  .xAxis().tickFormat(function(v) {return v;});

  // time graph
  populationChart.width(480)
    .height(150)
    .margins({top: 10, right: 10, bottom: 20, left: 60})
    .dimension(volumeByPopulation)
    .group(volumeByPopulationCount)
    .transitionDuration(500)
  .elasticY(true)
    .x(d3.scale.log().domain([1e2, maxPopulation])) // scale and domain of the graph
    .xAxis();

  // Counties Charts
  isCountyChart.width(900)
      .height(isCountyGroup.size()*25+50)
      .margins({top: 5, left: 10, right: 10, bottom: 20})
      .dimension(isCounty)
      .group(isCountyGroup)
      .colors(d3.scale.category20())
      .label(function (d){
         return d.key;
      })
      .title(function(d){return d.value;})
      .xAxis().ticks(4);


  /*isCountyChart.width(250)
    .height(220)
    .radius(100)
    .innerRadius(30)
    .dimension(isCounty)
    .title(function(d){return d.value;})
    .group(isCountyGroup);*/

  // Table of earthquake data
  dataTable.width(960).height(800)
    .dimension(populationDimension)
  .group(function(d) {
    return "List of all villages corresponding to the filters"
   })
  .size(1000)             // number of rows to return
    .columns([
      function(d) { return d.NAME; },
      function(d) { return d.NAME_2},
      function(d) { return d.NAME_3},
      function(d) { return d.NAME_4; },
      function(d) { return d.POP; },
      function(d) { return d.hospitals; },
      function(d) { return d.schools; },
      function(d) { return d.banks; },
      function(d) { return d.counties; },
      function(d) { return d.prefectures; }
    ])
    .sortBy(function(d){ return d.population; })
    .order(d3.ascending);

 
/****************************
* Step6: Render the Charts  *
****************************/

  dc.renderAll();

};
