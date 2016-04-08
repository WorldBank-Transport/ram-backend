var express = require('express'),
    url = require("url"),
    path = require("path"),
    fs = require("fs")
    port = process.argv[2] || 8888,
    fork = require('child_process').fork,
    basicAuth = require('basic-auth'),
    compression = require('compression');

//Keeping the credentials outside git
var credentials = JSON.parse(fs.readFileSync('./data/user.json','utf8'));

var app = express();

//Start the timematrix service and socket on a separate thread
function timematrix() {
   var tm = fork('./scripts/node/timematrix.js');

    tm.on('disconnect', function () {
      console.warn('timematrix disconnected!');
    });

    tm.on('close', function () {
      console.warn('timematrix crashed!');
      timematrix()
    });
}

timematrix();

//basic authentication stuff
var auth = function (req, res, next) {
  function unauthorized(res) {
    res.set('WWW-Authenticate', 'Basic realm=Authorization Required');
    return res.sendStatus(401);
  };

  var user = basicAuth(req);

  if (!user || !user.name || !user.pass) {
    return unauthorized(res);
  };

  if (user.name === credentials.user && user.pass === credentials.pass) {
    return next();
  } else {
    return unauthorized(res);
  };
};

app.use('/', [auth, compression(), express.static(__dirname + '/',{ maxAge: 86400000 })]);

app.listen(parseInt(port, 10));
console.log("Static file server running at\n  => http://localhost:" + port + "/\nCTRL + C to shutdown");
