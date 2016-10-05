 
 ![Build status](https://travis-ci.org/WorldBank-Transport/Rural-Road-Accessibility.svg?branch=master)
 [![Coverage Status](https://coveralls.io/repos/github/WorldBank-Transport/Rural-Road-Accessibility/badge.svg)](https://coveralls.io/github/WorldBank-Transport/Rural-Road-Accessibility)
 
#Rural-Road-Accessibility (RRA)

RRA will help you to calculate the traveltime between villages and sets of POIs. It will return a CSV file with the travel time from each village to the nearest POI of a type.

You need to have OSRM v5 installed on your machine: https://github.com/Project-OSRM/osrm-backend/wiki/Building-OSRM also you need to have node installed. Currently this only runs on OS X or Linux (it is depending on OSRM which does not (yet) run on windows)

To install RRA go to the route folder, do `npm install`

Next configure your data sources, see the example config in the docs folder

Once it is installed and properly configured start the application with `node index.js` and you can access the webinterface on http://localhost:8888
