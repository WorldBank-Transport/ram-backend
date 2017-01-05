## Background

The rural accessibility project started out as a way to calculate the minimum travel time from a series of villages to certain types of amenities.
The original intent was to create isochrone maps of these travel times, but later on the focus moved to the statistics. The goal is to calculate the 
(lack of) improvement for the accessibility of amenities by villagers given a road improvement plan. The current situation is used as a baseline
and the user can upload improved road networks and calcalute the accessibility numbers for a given region. Also the user can compare the new
situation with the baseline. The resulting timedistance matrix is in the CSV format which can either be explored in the browser or downloaded to be analysed
in for instance QGIS.

Since both the upgraded road network files and the resulting CSV files can be quite large and it is a hassle to wait for callbacks on regular large file 
transfers, the whole project is using socket.io's websockets. However this does create quite a bit of callback hell and makes the code harder to 
understand and follow than normal - or I'm not well versed in the proper way to set up these type of projects ;) This document should give some helpful 
insights on the project though.


## Structure

The main application file in `index.js` all functions and commands flow through this one because of the authenticated websocket connections. It doubles
as a webserver for the static files, since we wanted to run the entire system with one command and not require additional webserver software.

The whole project is written around `CalculateETA.js` a node based function around `OSRM` that calculates the timedistance matrix. It runs on a seperate 
thread, which is bit unusual for javascript, but since the calculations can take minutes it is way better for the responsivesness of the overall application.

The `data` directory, which is in .gitignore contains all the source data and the results. Villages, POIs, road networks and results are grouped together in 
projects which all get their own directory within the data directory. The project-configurations are stored in the `data/config.json`.

The main webclient startingpoint is `web/index.html` which reads the config.json to determine which projects are available. For each project two views are available: 
* `web/views/project.html` which allows the user to upload alternative road scenarios, calculate statistics for available road scenarios & specified regions and
view or download the results. 
* `web/views/result.html` which shows a list of available result files, which the user can compare, analyse and filter using crossfilter.js and download subsets
of the main result file. 

There are afew bash helper scripts that get called by index.js to do some transformations:
* `ogr2osm.sh` to transform shapefiles to OSM XML files, it requires a shapefile and a translation file eg. `scripts/Shapefile to OSM/guihou.py` 
* `osm2osrm.sh` to transform OSM files to OSRM files, it requires an OSM file and a profile file eg. `scripts/OSRM import/profile.lua`
* `profile2prepare.sh` to transform an already uploaded OSM file to OSRM
* `unzip.sh` to unpack a zipfile and do a simple check to see what kind of files are in it and what the next step should be

Work is currently being done to create an administrator interface to manage projects and create new projects. This interface can be accessed via `web/admin.html`

# The main files in more detail

## index.js

## CalculteETA.js

## project.html

## result.html

## admin.html
