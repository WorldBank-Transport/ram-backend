"use strict";
var CONFIG = [],
PROJECTS = [],
ACTIVECONFIG,
upload,
SOCKET;
//connect
function validSocket(socket) {
    socket.emit('getConfig');
    socket.on('configList',function(data){_parseConfigList(data,socket)});
    socket.on('projectsRemoved',function(){socket.emit('getConfig')})
}

function inValidSocket(socket) {
}
//get config

//get project dirs

//create list (proj, edit, del)
//             create new proj
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
    
    row.append('td').append('span').attr('class',function(d){return d.name===undefined?'unfinished':'btn btn-warning disabled glyphicon glyphicon-pencil'});
    row.append('td').append('span').attr('class',function(d){return d.name===undefined?'unfinished':'btn btn-primary disabled glyphicon glyphicon-copy'});
    row.append('td').append('span').attr('class','btn btn-danger  glyphicon glyphicon-trash').on('click',function(d){_areYouSure(d,socket)});

    d3.select('#configList').selectAll('tr')
        .data(PROJECTS,function(d) { return d.created; }).exit().remove();
}

function _areYouSure(project,socket) {
    var r = confirm('Are you sure, this cannot be undone')
    r?socket.emit('removeProject',{project:project.uid}):false;
}