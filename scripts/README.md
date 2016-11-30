# Various scripts and HOWTOs to prepare and serve data for the RRA project

###Shapefile to OSM

Documentation and translation file to convert a shapefile with a roadnetwork to an .osm file

###OSRM import

Documentation and profile file to convert an .osm file to an OSRM-prepared dataset

###node

The actual services to get statistics on the data run `node timematrix.js` or better `supervisor timematrix.js`


### To run with test fixtures.

Link the test data as source, build npm, add lua profiles, and recreate osrm files.
    ln -s test/fixtures/data web/data
    npm install
