process.env.NODE_ENV = 'test';


var chai  = require("chai");
var expect  = chai.expect;
var request = require("request");
var spawn = require('child_process');
var fs = require('fs');
var s = require('string');
var cheerio = require('cheerio');
var app = require('../index.js');
var Browser = require('zombie');
var http = require('http');
var assert = require('assert');


var credentials = JSON.parse(fs.readFileSync('./web/data/user.json','utf8'));

/*
var auth = {
  'auth': {
      'user': credentials.user,
      'pass': credentials.pass,
      'sendImmediately': false
    }};

describe("Server should respond", function() {
  var url = "http://localhost:8888/";
  var server = spawn.spawn("node", [__dirname+'index.js']);

  describe("Homepage", function() {
    it("breaks on un-authenticated", function(done) {
      request(url, function(error, response, body) {
        expect(response.statusCode).to.equal(401);
        done();
      });
    });

    it("athenticates", function(done) {
      request.get(url, auth, function(error, response, body) {
        expect(error).to.be.not.ok;
        expect(response).to.be.not.a('undefined');
        expect(response.statusCode).to.equal(200);
        done();
      });
    });
  });
});
*/

describe('Jamaica as fixture test data', function() {
  before(function() {
    //this.server = http.createServer(app).listen(8888);
    Browser.localhost('localhost', 8888);
    this.browser = new Browser();
    this.browser.on('authenticate', function(authentication) {
      authentication.username = credentials.user;
      authentication.password = credentials.pass;
    });
  });



  it('should load main page', function(done) {
    this.browser.visit('/',done);
    this.browser.assert.text('title', 'My Awesome Page');
    console.log(d);
    done();
  });

  // ...

});


describe("Jamaica as fixture test data", function(){
  var url = "http://localhost:8880/";

  it("should list as project",function(done){
    request.get(url, auth, function(error, response, body) {
      done();
      var $ = cheerio.load(body);
      console.log(body,"\nxx: "+ $('#projectList').html());
      var footerText = $('footer p').html();
            expect(s(footerText).contains('Tanzim') && s(footerText).contains('Saqib')).to.be.ok;
        done();
      expect('.projectList').to.not.contain.text('Jamaca');

    });
  });
  it("should have a map");
  it("should navigate to JM project page");

});
