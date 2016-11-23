"use strict";
var CONFIG = [],
ACTIVECONFIG;
//called when the socket is authenticated
function validSocket(socket) {
    d3.json('../data/config.json',function(err,json){
        if(err) {
            if(err.status == 404) {
                newConfig();
            }
            else throw err;
        }
        else { 
            CONFIG = json;
            createConfigList(json);
            d3.select('#newConfig').classed('disabled',false).on('click',newConfig);
        }
    })

}
function inValidSocket(socket) {
}
// There is no config on the server, apparently a new install, or someone wants a new config
function newConfig() {
    var time = new Date().getTime();
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
        }
    };
    createEditConfigScreen(config,true)
}

function createEditConfigScreen(config,nieuw) { 
    ACTIVECONFIG = config;
    var c = d3.select('#configScreen').html('');
    var t = document.querySelector('#configTemplate');
    var b;
    t.content.querySelector('#newProjectName').value=config.name;
    t.content.querySelector('#newPopulationAttribute').value=config.population;
    var p = t.content.querySelector('#existingPOIs');
    p.innerHTML='';
    var s = t.content.querySelector('#existingStats');
    s.innerHTML='';
    var l = t.content.querySelector('#existingLevels');
    l.innerHTML='';
    if(nieuw!==true) {
        b = document.querySelector('#showBaselineTemplate');
        b.content.querySelector('#osmFileName').innerText=config.baseline.files.osm;
        b.content.querySelector('#profileFileName').innerText=config.baseline.files.profile;
        b.content.querySelector('#villagesFileName').innerText=config.villages;
        b.content.querySelector('#thumbnailFileName').innerText=config.thumbnail;
        

        for(var poi in config.pois) {
            p = addPoi(p,poi,config.pois[poi]);
        }
        
        config.stats.forEach(function(stat,idx) {            
            s = addStat(s,stat,idx)
        })     
        config.levels.forEach(function(level,idx){
            l = addLevel(l,level,idx)
        })
        
    }
    else {
        b = document.querySelector('#uploadBaselineTemplate');

    }
    
    var clone = document.importNode(t.content, true);
    document.querySelector('#configScreen').appendChild(clone);
    var bclone = document.importNode(b.content, true);
    document.querySelector('#baselineFiles').appendChild(bclone);
}

// Parse the config to create a GUI
function createConfigList(config) {
    var configList = d3.select('#configList');
    configList.selectAll('div')
    .data(config)
    .enter()
    .append('div')
    .text(function(d){return d.name})
    .on('click',createEditConfigScreen);
}
function addPoi(node,poi,value) {

    var tr = document.createElement('tr');   
    tr.setAttribute('poi',poi);   
    tr.innerHTML = '<td><input type="text" class="form-control" value='+poi+'></td><td>'+value+'</td><td><input class="btn btn-danger"  type="button" value="Remove" onclick="removePoi(this)"></td>';
    node.appendChild(tr);
    return node;
}


function addLevel(node,level,i) {

    var tr = document.createElement('tr');
     tr.setAttribute('level',i); 
    tr.innerHTML = '<td><input type="text" class="form-control" value='+level.name+'></td><td><input type="text" class="form-control" value='+level.geometryId+'></td><td>'+level.file+'</td><td><input class="btn btn-danger"  type="button" value="Remove" onclick="removeLevel(this)"></td>';
    node.appendChild(tr);
    return node;
}
function removePoi(e) {
    var row = e.parentNode.parentNode;
    var poiIdx = row.getAttribute('poi');
    delete ACTIVECONFIG.pois[poiIdx];
    setChanged(row.parentNode);    
    row.remove();
}
function addStat(node,stat,i) {
    var tr = document.createElement('tr');
    tr.setAttribute('stat',i); 
    tr.innerHTML = '<td><input type="text" class="form-control" value='+stat.poi+'></td><td><input type="number" class="form-control" value='+stat.minutes+'></td><td><input class="btn btn-danger"  type="button" value="Remove" onclick="removeStat(this)"></td>';
    node.appendChild(tr);
    return node;
}
function addStatistics(e) {
    var row = e.parentNode.parentNode;
    var cells = row.getElementsByTagName('td');
    var name =cells[0].getElementsByTagName('input')[0];
    if(!name.checkValidity()) {
        cells[0].classList =['has-error'];
    }
    else {
        cells[0].classList =[];   
        var poiName = cells[0].getElementsByTagName('input')[0].value;
        cells[0].getElementsByTagName('input')[0].value = '';
        var poiValue = parseInt(cells[1].getElementsByTagName('input')[0].value);
        cells[1].getElementsByTagName('input')[0].value=60;
        var stat = {};
        stat.poi = poiName;
        stat.minutes = poiValue;
        var i = ACTIVECONFIG.stats.push(stat)-1;
        var el = document.getElementById('existingStats');
        addStat(el,stat,i);
        setChanged(el);
    }
}
function removeStat(e) {
    var row = e.parentNode.parentNode;
    var statIdx = row.getAttribute('stat');
    ACTIVECONFIG.stats[statIdx].removed = true;
    setChanged(row.parentNode);
    row.remove();

}
function removeLevel(e) {
    var row = e.parentNode.parentNode;
    var levelIdx = row.getAttribute('level');
    ACTIVECONFIG.levels[levelIdx].removed = true;
    setChanged(row.parentNode);
    row.remove();

}

function setChanged(el){
    ACTIVECONFIG.changed = true;
    d3.select('#cancelConfig').classed('disabled',false);
    d3.select('#saveConfig').classed('disabled',false);
    el.classList = [el.classList[0]+' changed']
}
function updateName(e) {
    ACTIVECONFIG.name = e.value;
    setChanged(e);
}
function updatePopulation(e) {
    ACTIVECONFIG.population = e.value;
    setChanged(e);
}
function updateSpeed(e) {
    ACTIVECONFIG.maxSpeed = e.value==''?0:parseInt(e.value);
    setChanged(e);
}
function updateTime(e) {
    ACTIVECONFIG.maxTime = e.value==''?0:parseInt(e.value);
    setChanged(e);
}