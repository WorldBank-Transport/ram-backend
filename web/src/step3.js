var OSRMLIST,socket,WALKSPEED=3.6;

d3.json('../data/user.json',function(d){
  Authenticate(d.user,d.pass);
})

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
          .html($.i18n.prop(data.msg,data.p0,data.p1))
      }
      else if (data.socketIsUp) {
        d3.select('#logfield')
          .insert("div", ":first-child")
          .html($.i18n.prop('gnl_connected'))
          .style({color:'green','font-weight':'bold'})
      }
      else if(data.csvs) {
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
      else if(data.users) {
        d3.select('#users')
        .html($.i18n.prop('gnl_users', data.users));
      }
    });
  })

  socket.on('disconnect',function(){
    d3.select('#logfield')
      .insert("div", ":first-child")
      .html($.i18n.prop('gnl_disconnected'))
      .style({color:'red','font-weight':'bold'})
    socket.off('status');
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
    d3.select('#comstep').style('display','block');
    var value = el.value;
    d3.csv('../data/csv/'+el.value,function(normal){
      normal.forEach(function(d,idx) {
      d.population  = +d.POP;
      d.banks   = d3.round(((+d.banks)+(+d.nearest/WALKSPEED))/60.,0);
      d.hospitals = d3.round(((+d.hospitals)+(+d.nearest/WALKSPEED))/60.,0);
      d.schools = d3.round(((+d.schools)+(+d.nearest/WALKSPEED))/60.,0);
      d.counties = d3.round(((+d.counties)+(+d.nearest/WALKSPEED))/60.,0);
      d.prefectures = d3.round(((+d.prefectures)+(+d.nearest/WALKSPEED))/60.,0);
      d.county= d.NAME_3;
      d.lat = d3.round(+d.lat,6);
      d.lon = d3.round(+d.lon,6);
    });

    statList.push({file:value,data:normal});

    compareList.push(value)
  //  statList.push({file:value,total:ssPop,county:c60min,hospital:h30min,banks:b30min,school:s20min})
    createTable()
    })

  }
  else {
    statList.splice(compareList.indexOf(el.value),1)
    compareList.splice(compareList.indexOf(el.value),1);
    createTable()
  }
 
}


d3.select('#travelTime').on('input',function(d){
  createTable(this.value);
})

function createTable(minute) {
  if(minute === undefined) minute = $('#travelTime').val();
  $('#anl_slider_txt').html($.i18n.prop('anl_slider_txt',minute));
  var list = [];
  statList.forEach(function(item){
    var data = item.data;
    var value = item.file;
    var ssPop = data.reduce(function(p,c){return p+c.population},0)
    var cmin = data.reduce(function(p,c){return c.counties<=minute?p+c.population:p},0);
    var hmin = data.reduce(function(p,c){return c.hospitals <=minute?p+c.population:p},0);
    var bmin = data.reduce(function(p,c){return c.banks <=minute?p+c.population:p},0);
    var smin = data.reduce(function(p,c){return c.schools <=minute?p+c.population:p},0);
    list.push({file:value,total:ssPop,county:cmin,hospital:hmin,banks:bmin,school:smin})
  })


  d3.select('#comstats').html('');
  if(list.length>0) {
    d3.select('#comstats')
      .selectAll('tr')
      .data(list)
      .enter()
      .append('tr')
      .html(function(d){
        return '<td>'+d.file+'</td><td>'+Math.round(d.county/d.total*1000)/10+'</td><td>'+Math.round(d.hospital/d.total*1000)/10+'</td><td>'+Math.round(d.banks/d.total*1000)/10+'</td><td>'+Math.round(d.school/d.total*1000)/10+'</td><td>'
      });  

    d3.select('#comstats')
      .insert("tr", ":first-child")
      .html('<th>'+$.i18n.prop('anl_file')+'</th><th>'+$.i18n.prop('anl_60c')+'</th><th>'+$.i18n.prop('anl_30h')+'</th><th>'+$.i18n.prop('anl_30b')+'</th><th>'+$.i18n.prop('anl_20s')+'</th>')
  }
}

function createCsvList(csv) {
  var time = csv.split('-')[1];
  var id = csv.split('-')[0];
  if(csv.split('-')[2])
    var nw = csv.split('-')[2].split('.')[0];
  else nw = '';
  var date = new Date(parseInt(time));
  var result = '<td>'+$.i18n.prop('anl_csv_list',date.toLocaleString(),id,nw)+'</td><td><a href="../data/csv/'+csv+'"> '+$.i18n.prop('anl_download')+'</a> </td><td> <span class="changeOSRM" name="'+csv+'"> '+$.i18n.prop('anl_view')+'</span></td><td><div class="checkbox"><label><input type="checkbox" class="compareButtons" value="'+csv+'">'+$.i18n.prop('anl_compare')+'</label></div></td>';
     
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
  var url = getUrlVars()['lang']===undefined?('analyse.html?csv='+pad):('analyse.html?csv='+pad+'&lang='+getUrlVars()['lang']);
  window.history.pushState({},'analyse stats', url);

  createStats(pad);
}

var csvfile;
if(getUrlVars()['csv']) {
  csvfile = getUrlVars()['csv'];
  createStats(csvfile)
}

function createStats(pad) {
  var time = pad.split('-')[1];
  var id = pad.split('-')[0].split('/')[pad.split('-')[0].split('/').length-1];
  var nw = pad.split('-')[2].split('.')[0];
  var date = new Date(parseInt(time));
  d3.select('#chosenFile').html($.i18n.prop('anl_statistics',date.toLocaleString(),decodeURIComponent(id),nw));

  d3.select('#step2').style('display','block');
  window.setTimeout(function(){
    queue()
    .defer(d3.csv, pad)
    .await(buildGraphs)
  },1000)
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
var volumeByPopulation;
function buildGraphs(err,normal) {
 var facts,all, hospitalsValue;
 
  normal.forEach(function(d,idx) {
    d.population  = +d.POP;
    d.banks   = d3.round(((+d.banks)+(+d.nearest/WALKSPEED))/60.,0);
    d.hospitals = d3.round(((+d.hospitals)+(+d.nearest/WALKSPEED))/60.,0);
    d.schools = d3.round(((+d.schools)+(+d.nearest/WALKSPEED))/60.,0);
    d.counties = d3.round(((+d.counties)+(+d.nearest/WALKSPEED))/60.,0);
    d.prefectures = d3.round(((+d.prefectures)+(+d.nearest/WALKSPEED))/60.,0);
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

  d3.select('#ssCounty').html($.i18n.prop('anl_sum_county',Math.round(c60min/ssPop)/10));
  d3.select('#ssHospital').html($.i18n.prop('anl_sum_hospital',Math.round(h30min/ssPop)/10));
  d3.select('#ssBank').html($.i18n.prop('anl_sum_bank',Math.round(b30min/ssPop)/10));
  d3.select('#ssSchool').html($.i18n.prop('anl_sum_school',Math.round(s20min/ssPop)/10));
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
  dc.dataCount(".dc-data-counts")
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
    .domain([0, Math.min(maxHospital,175)]))
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
    .x(d3.scale.linear().domain([0, Math.min(maxBanks,175)]))
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
    .x(d3.scale.linear().domain([0, Math.min(maxSchools,175)]))
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
    .x(d3.scale.linear().domain([0, Math.min(maxPrefectures,550)]))
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
    .x(d3.scale.linear().domain([0, Math.min(maxCounties,350)]))
  .elasticY(true)
  .xAxis().tickFormat(function(v) {return v;});

  // time graph
  populationChart.width(480)
    .height(150)
    .margins({top: 10, right: 10, bottom: 20, left: 60})
    .dimension(volumeByPopulation)
    .group(volumeByPopulationCount)
    .transitionDuration(500)
  .elasticY(true)
    .x(d3.scale.log().domain([10, maxPopulation])) // scale and domain of the graph
    .xAxis().ticks(10, ",.0f").tickSize(5, 0);

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
