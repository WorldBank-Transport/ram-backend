"use strict";
//called when the socket is authenticated
function validSocket(socket) {
    socket.on('config',function(c){
        createProjectList(c.config);
    });
    socket.on('status',function(D){
        console.log(D)
    })
}

// There is no config on the server, apparently a new install
function newConfig() {
    //TODO
}

var projection = d3.geo.mercator();

// Parse the config to create a GUI
function createProjectList(config) {

    d3.select('#projectList').html('');
    var projectList = d3.select('#projectList')
    .selectAll('a')
    .data(config)
    .enter()
    .append('a')
    .attr('class','projectfile')
    .attr('href',function (d) {
        var url = getUrlVars()['lang']===undefined?('views/project.html?project='+d.uid):('views/project.html?project='+d.uid+'&lang='+getUrlVars()['lang']);
        return url;
    });
    
 projectList.append('p').text(function(d){return d.name});
 projectList.append('svg').attr('id',function(d){return 'svg_'+d.uid});

config.forEach(function (d) {
    var url = './data/'+d.uid+'/'+d.thumbnail;
    d3.json(url,function(err,json){
        if (err) throw err;

        var path = d3.geo.path()
        .projection(projection);
        var svg = d3.select('#svg_'+d.uid);
     
        var bounds = path.bounds(json),
              dx = bounds[1][0] - bounds[0][0],
              dy = bounds[1][1] - bounds[0][1],
              x = (bounds[0][0] + bounds[1][0]) / 2,
              y = (bounds[0][1] + bounds[1][1]) / 2,
              scale = .9 / Math.max(dx / 300, dy / 150),
              translate = [300 / 2 - scale * x, 150 / 2 - scale * y];

        var g = svg.append("g");
        g.append('path')
        .datum(json)
        .attr("d", path)
        
      .style("stroke-width", 1.5 / scale + "px")
      .attr("transform", "translate(" + translate + ")scale(" + scale + ")");
    })
})
}