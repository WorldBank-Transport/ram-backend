var OSRMLIST;
var socket;
d3.json('../data/user.json',function(d){
  Authenticate(d.user,d.pass);
})
var socket;
function Authenticate(user,pass) {
  var sockethost = window.location.protocol +'//'+ window.location.host.split(':')[0] + ':5000'
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
          .html(createCsvList)
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


function createCsvList(csv) {
      var time = csv.split('-')[1].split('.')[0];
      var id = csv.split('-')[0];
      var date = new Date(parseInt(time));

      var result = '<td>Calculation done on '+date.toLocaleString()+' for '+id +': </td><td><a href="../data/csv/'+csv+'"> download CSV file</a> </td><td> <a href="analyse.html?csv=../data/csv/'+csv+'"> view statistics</a></td>';
      return result;
}