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
  it("extracts PBF to OSM data", function(done) {
    this.timeout(7000);
    var fixture_pbf=__dirname+"/fixtures/JM";
    var fixture_osm= __dirname + "/fixtures/JM.osm" ;

    expect(file(fixture_osm)).to.exist;
    var osmosis = spawn.spawnSync('osmosis', ['--rbf', fixture_pbf, '--wx',fixture_osm]);
    done();
    expect(osmosis.status).to.be.equal(0);
    expect(file(fixture_osm)).to.exist;
  });

  describe("Makes the OSRM data from OSM", function() {
  });
  describe("POIs and pop data", function() {
  });
});
