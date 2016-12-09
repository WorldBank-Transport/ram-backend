"use strict";
var CONFIG = [],
PROJECTS = [],
ACTIVECONFIG,
upload,
SOCKET;
//connect
function validSocket(socket) {
    socket.emit('getConfig');
    socket.on('configList',function(data){
        _parseConfigList(data,socket);
        _createProjectEditor(_newConfig(),socket);
    });
    socket.on('projectsRemoved',function(){socket.emit('getConfig')})
   
    d3.select('#newProject').on('click',function(){_createProjectEditor(_newConfig(),socket)})
    d3.select('#cancelConfig').on('click',function(){socket.emit('getConfig')})
}

function inValidSocket(socket) {
}

function _parseConfigList(data,socket) {    
    CONFIG = data.data.conf;
    PROJECTS = _parseProjects(data.data.projects)
    _createConfigList(socket);  
} 

function _parseProjects(projects) {
    var results = projects.map(function(project) {
        var p = CONFIG.reduce(function(a,b){return b.uid === project?b:a},false);
        return p?p:{'name':undefined,created:parseInt(project.split('_')[1]),uid:project}
    })   
    return results; 
}


function _createConfigList(socket) {
    var row= d3.select('#configList')
        .selectAll('tr')
        .data(PROJECTS,function(d) { return d.created; })
        .enter()
        .append('tr');
    row.attr('class',function(d){return d.name===undefined?'unfinished':''})
    row.append('td').text(function(d) { return d.name===undefined?'unfinished':d.name});
    row.append('td').text(function(d) { return new Date(d.created).toLocaleString()});
    
    row.append('td').append('span').attr('class',function(d){return d.name===undefined?'unfinished':'btn btn-warning glyphicon glyphicon-pencil'}).on('click',function(d){_createProjectEditor(d,socket)});
    row.append('td').append('span').attr('class',function(d){return d.name===undefined?'unfinished':'btn btn-primary disabled glyphicon glyphicon-copy'});
    row.append('td').append('span').attr('class','btn btn-danger  glyphicon glyphicon-trash').on('click',function(d){_removeProject(d,socket)});

    d3.select('#configList').selectAll('tr')
        .data(PROJECTS,function(d) { return d.created; }).exit().remove();

    d3.select('#configList').selectAll('tr')
    .sort(function(a,b){
      if(a.created > b.created) {
        return -1;
      }
      if(a.created < b.created) {
        return 1;
      }
      return 0;
    });
}
//send a message to the server to delete the project from disk
function _removeProject(project,socket) {
    var r = confirm('Are you sure, this cannot be undone')
    r?socket.emit('removeProject',{project:project.uid}):false;
}

function _createProjectEditor(project,socket) {
    ACTIVECONFIG = project;    
    $('#newProjectName').val(project.name).on('change',function(){ACTIVECONFIG.name = this.value;$(this).addClass('changed')}).removeClass('changed');
    $('#newPopulationAttribute').val(project.population).on('change',function(){ACTIVECONFIG.population = this.value;$(this).addClass('changed')}).removeClass('changed');
    $('#newMaxSpeed').val(project.maxSpeed).on('change',function(){ACTIVECONFIG.maxSpeed = this.value;$(this).addClass('changed')}).removeClass('changed');
    $('#newMaxTime').val(project.maxTime).on('change',function(){ACTIVECONFIG.maxTime = this.value;$(this).addClass('changed')}).removeClass('changed');
    $('#osmFileName').val(project.baseline.files.osm).removeClass('changed');
    $('#profileFileName').val(project.baseline.files.profile).removeClass('changed');
    $('#villagesFileName').val(project.villages).removeClass('changed');
    $('#thumbnailFileName').val(project.thumbnail).removeClass('changed');

}



function _newConfig() {
    var time = Date.now();
    var uid = 'project_'+time;
    var config = {
        "name": "",
        "villages": "",
        "pois": {
        },
        "population" : "",
        "stats": [ 
        ],
        "levels": [
        ],
        "thumbnail":"",
        "baseline": {
            "name": "",
            "dir": "",
            "files": {
                "osm": "",
                "profile": "",
                "osrm": ""
            },
            "created": {
                "time":null,
                "user":""
            },
            "uid": ""
        },
        "created": time,
        "uid":uid,
        "maxSpeed":120,
        "maxTime":3600,
        "activeOSRM":{
           "name": "",
            "dir": "",
            "files": {
                    "osm": "",
                    "profile": "",
                    "osrm": ""
            },
            "created": {
                "time":null,
                "user":""
            },
            "uid": ""
        },
        "newConfig":true
    };
    return config;
}
