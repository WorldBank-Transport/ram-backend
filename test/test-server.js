var chai  = require("chai");
var expect  = chai.expect;
var request = require("request");
var spawn = require('child_process');
var fs = require('fs');

describe("Server should respond", function() {
  var url = "http://localhost:8888/";
  var server = spawn.spawn("node", [__dirname+'index.js']);

  describe("homepage", function() {
    it("breaks on un-authenticated", function(done) {
      request(url, function(error, response, body) {
        expect(response.statusCode).to.equal(401);
        done();
      });
    });

    it("athenticates", function(done) {
      var credentials = JSON.parse(fs.readFileSync('./web/data/user.json','utf8'));
      request.get(url, {
        'auth': {
            'user': credentials.user,
            'pass': credentials.pass,
            'sendImmediately': false
          }}, function(error, response, body) {
        expect(response.statusCode).to.equal(200);
        done();
      });
    });

  });


});
