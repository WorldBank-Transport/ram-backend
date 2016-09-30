"use strict";
//called when the socket is authenticated
function validSocket(socket) {
    d3.json('../data/config.json',function(err,json){
        if(err) {
            if(err.status == 404) {
                newConfig();
            }
            else throw err;
        }
        else createConfigList(json);
    })
}
// There is no config on the server, apparently a new install
function newConfig() {
    //TODO
}

// Parse the config to create a GUI
function createConfigList(config) {
    var configList = d3.select('#configList');
    configList.selectAll('div')
    .data(config)
    .enter()
    .append('div')
    .text(function(d){return d.name})
    .on('click',createConfigScreen)
}

function createConfigScreen(item) {
    var name = item.name;
    var villages = item.villages;
    var pois = [];
    for(var poi in item.pois) {
        pois.push({name:poi,file:item.pois[poi]});
    }
    var levels = item.levels || [];
    var baseline = item.baseline;
    var cS = d3.select('#configScreen').html('');

    cS.append('div')
    .attr('class','configName')
    .html(function(d){
        return "<span class='lbl'>"+$.i18n.prop('adm_name')+"</span><span class='wrd'>"+name+"</span>";
    });
    
    cS.append('div')
    .attr('class','configVillages')
    .html(function(d){
        return "<span class='lbl'>"+$.i18n.prop('adm_villages')+"</span><span class='wrd'>"+villages+"</span>";
    });
    
    cS.append('div')
    .attr('class','configPOIs')
    .append('span').attr('class','lbl').text($.i18n.prop('adm_pois'))
    .selectAll('div')
    .data(pois)
    .enter()
    .append('div')
    .html(function(d){
        return "<span class='lbl'>"+d.name+"</span><span class='wrd'>"+d.file+"</span>";
    });

    cS.append('div')
    .attr('class','configLevels')
    .append('span').attr('class','lbl').text($.i18n.prop('adm_levels'))
    .selectAll('div')
    .data(levels)
    .enter()
    .append('div')
    .html(function(d){
        return "<span class='lbl'>"+$.i18n.prop('adm_name')+"</span><span class='wrd'>"+d.name+"</span><br/>"+
        "<span class='lbl'>"+$.i18n.prop('adm_file')+"</span><span class='wrd'>"+d.file+"</span><br/>"+
        "<span class='lbl'>"+$.i18n.prop('adm_id')+"</span><span class='wrd'>"+d.geometryId+"</span>";
    });

   cS.append('div')
   .attr('class','configBaseline')
   .html(function(d){

   });

   cS.append('div')
   .attr('class','configMaxSpeed')
   .html(function(d){
      return "<span class='lbl'>"+$.i18n.prop('adm_max_speed')+"</span><input type='number' value='"+item.maxSpeed+"'/>"
   })

   cS.append('div')
   .attr('class','configMaxTime')
    .html(function(d){
      return "<span class='lbl'>"+$.i18n.prop('adm_max_time')+"</span><input type='number' value='"+item.maxTime+"'/>"
   })

}