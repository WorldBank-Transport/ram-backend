var socket, uploader, quint = 5;

d3.json('../data/user.json',function(d){
  Authenticate(d.user,d.pass);
})

function Authenticate(user,pass) {
  var sockethost = window.location.protocol +'//'+ window.location.host;
  socket = io(sockethost);
  uploader = new SocketIOFileUpload(socket);
  uploader.listenOnSubmit(document.getElementById("uploadButton"), document.getElementById("file_input"));
  uploader.addEventListener('start',function(e){
    d3.select('#logfield')
      .insert("div", ":first-child")
      .html()
  })
  uploader.addEventListener('progress',function(e){
    var progress= Math.round(e.bytesLoaded / e.file.size*100);
    if(progress > quint) {
      d3.select('#logfield')
        .insert("div", ":first-child")
        .html($.i18n.prop('upl_progress',progress));
      quint=quint+10;
    }
  })
  uploader.addEventListener('complete',function (e) {
    d3.select('#logfield')
      .insert("div", ":first-child")
      .html($.i18n.prop('upl_process',e.file.name));
    d3.select('#logfield')
      .insert("div", ":first-child")
      .html($.i18n.prop('upl_patience'))
      .style({color:'orange','font-weight':'bold'});  
    quint = 5;
  })
  socket.on('connect', function(){
    socket.emit('authentication', {username: user, password: pass});
  });
  socket.on('unauthorized', function(err){
    alert($.i18n.prop('gnl_unauth'));
  });
  socket.on('authenticated', function() {
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
      else if(data.result) {
        d3.select('#step3')
          .style('display','block');      
        var pad = data.result.split('\n')[0];
        socket.emit('setOSRM',{osrm:pad});
        d3.select('#nextStep')
          .attr('href','./calculate.html?osrm='+pad);

      }
    });
  })


  socket.on('disconnect',function(){
    d3.select('#logfield')
      .insert("div", ":first-child")
      .html($.i18n.prop('gnl_disconnected'))
      .style({color:'red','font-weight':'bold'})
    socket.off('status');
  })
}