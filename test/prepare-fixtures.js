/*jshint expr: true*/

var chai  = require("chai");
var spawn = require('child_process');
var chai = require('chai');
var chaiFiles = require('chai-files');

chai.use(chaiFiles);
var expect = chai.expect;
var file = chaiFiles.file;
var dir = chaiFiles.dir;



describe("Prepare fixtures data for testing...", function() {
  it("makes sure fixtures are there", function(done) {
    expect(file( __dirname + "/web/data/JM.osm")).to.exist;
  });

  describe("Makes the OSRM data from OSM", function() {
  });
  describe("POIs and pop data", function() {
  });
});
