var socket;
d3.json('../data/user.json',function(d){
  Authenticate(d.user,d.pass);
})
var socket;
var uploader;
var quint = 5;
function Authenticate(user,pass) {
  var sockethost = window.location.protocol +'//'+ window.location.host;
  socket = io(sockethost);
  uploader = new SocketIOFileUpload(socket);
  uploader.listenOnSubmit(document.getElementById("uploadButton"), document.getElementById("file_input"));
  uploader.addEventListener('start',function(e){
     d3.select('#logfield')
      .insert("div", ":first-child")
      .html('Upload of file '+e.file.name+' has started')
  })
  uploader.addEventListener('progress',function(e){
    var progress= Math.round(e.bytesLoaded / e.file.size*100);
    if(progress > quint) {
     d3.select('#logfield')
      .insert("div", ":first-child")
      .html(progress+'% of the file is uploaded');
      quint=quint+10;
    }
  })
  uploader.addEventListener('complete',function (e) {
    d3.select('#logfield')
      .insert("div", ":first-child")
      .html(e.file.name+' has been uploaded, starting to process....');
    d3.select('#logfield')
      .insert("div", ":first-child")
      .html('this might take a while')
       .style({color:'orange','font-weight':'bold'});  
    quint = 10;
  })
  socket.on('connect', function(){
    socket.emit('authentication', {username: user, password: pass});
  });
  socket.on('unauthorized', function(err){
    alert('not a valid username or password, please try again.');
  });
  socket.on('authenticated', function() {
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
      else if(data.result) {
        d3.select('#step3')
        .style('display','block');      
        var pad = data.result.split('\n')[0];
        socket.emit('setOSRM',{osrm:pad});
        d3.select('#nextStep')
        .attr('href','./calculate.html?osrm='+pad);

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

  })
}