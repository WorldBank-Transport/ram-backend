d3.json('../data/user.json',function(d){
  authenticate(d.user,d.pass);
})

function authenticate(user,pass) {
  var sockethost = window.location.protocol +'//'+ window.location.host;
  socket = io(sockethost);
  socket.on('connect', function(){
    socket.emit('authentication', {username: user, password: pass});
  });
  socket.on('unauthorized', function(err){
    alert($.i18n.prop('gnl_unauth'));
  });
  socket.on('authenticated', function() {
    //we are authenticated and call for the local functions to continue
    if(validSocket!==undefined) {
       validSocket(socket)
    }
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
        else if(data.users) {
          d3.select('#users')
          .html($.i18n.prop('gnl_users', data.users));
        }
      })
  })
   socket.on('disconnect',function(){
    d3.select('#logfield')
      .insert("div", ":first-child")
      .html($.i18n.prop('gnl_disconnected'))
      .style({color:'red','font-weight':'bold'})
    socket.off('status');
     if(inValidSocket!==undefined) {
       inValidSocket(socket)
    }
  })
}