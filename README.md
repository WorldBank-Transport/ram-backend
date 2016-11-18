 
[![Build status](https://travis-ci.org/WorldBank-Transport/Rural-Road-Accessibility.svg?branch=master)](https://travis-ci.org/WorldBank-Transport/Rural-Road-Accessibility/)
[![Coverage Status](https://coveralls.io/repos/github/WorldBank-Transport/Rural-Road-Accessibility/badge.svg)](https://coveralls.io/github/WorldBank-Transport/Rural-Road-Accessibility)
 <a href="https://codeclimate.com/github/WorldBank-Transport/Rural-Road-Accessibility"><img src="https://codeclimate.com/github/WorldBank-Transport/Rural-Road-Accessibility/badges/gpa.svg" /></a>
 
#Rural-Road-Accessibility (RRA)

RRA calculates the traveltime between villages and sets of POIs. It returns a CSV file with the travel time from each village to the nearest POI of a type. Built to allow planning scenarions (add/remove road, road upgrade/downgrade).

Can run fully on OSM data, or user data. Internally is a modullar wrapper that prepares the input data if available, calls OSRM and visualizes the results.

#How to run RRA

Evenutally we want a docker image. For now you need to install each dependency:

You need to have OSRM v5 installed on your machine: https://github.com/Project-OSRM/osrm-backend/wiki/Building-OSRM also you need to have node installed. Currently this only runs on OS X or Linux (it is depending on OSRM which does not (yet) run on windows)

To install RRA go to the route folder, do `npm install`

Next configure your data sources, see the example config in the docs folder

Once it is installed and properly configured start the application with `node index.js` and you can access the webinterface on http://localhost:8888
