## Background

The rural accessibility project started out as a way to calculate the minimum 
travel time from a series of villages to certain types of amenities. The 
original intent was to create isochrone maps of these travel times, but later 
on the focus moved to the statistics. The goal is to calculate the (lack of) 
improvement for the accessibility of amenities by villagers given a road 
mprovement plan. The current situation is used as a baseline and the user can 
upload improved road networks and calcalute the accessibility numbers for a 
given region. Also the user can compare the new situation with the baseline. 
The resulting timedistance matrix is in the CSV format which can either be 
explored in the browser or downloaded to be analysed in for instance QGIS.

Since both the upgraded road network files and the resulting CSV files can be 
quite large and it is a hassle to wait for callbacks on regular large file 
uploads, the whole project is using socket.io's websockets. However this does 
create quite a bit of callback hell and makes the code harder to understand and 
follow than normal - or I'm not well versed in the proper way to set up these 
type of projects ;) This document should give some helpful insights on the 
project though.


## Structure

The main application file in `index.js` all functions and commands flow through 
this one because of the authenticated websocket connections. It doubles as a 
webserver for the static files, since we wanted to run the entire system with 
one command and not require additional webserver software.

The whole project is written around `CalculateETA.js` a node based function 
around `OSRM` that calculates the timedistance matrix. It runs on a seperate 
thread, which is bit unusual for javascript, but since the calculations can 
take minutes it is way better for the responsivesness of the overall 
application.

The `data` directory, which is in .gitignore contains all the source data and 
the results. Villages, POIs, road networks and results are grouped together in 
projects which all get their own directory within the data directory. The 
project-configurations are stored in the `data/config.json`.

The main webclient startingpoint is `web/index.html` which reads the 
config.json to determine which projects are available. For each project two 
views are available: 
* `web/views/project.html` which allows the user to upload alternative road 
scenarios, calculate statistics for available road scenarios & specified 
regions and view or download the results. 
* `web/views/result.html` which shows a list of available result files, which 
the user can compare, analyse and filter using crossfilter.js and download 
subsets of the main result file. 

There are afew bash helper scripts that get called by index.js to do some 
transformations:
* `ogr2osm.sh` to transform shapefiles to OSM XML files, it requires a 
shapefile and a translation file eg. `scripts/Shapefile to OSM/guihou.py` 
* `osm2osrm.sh` to transform OSM files to OSRM files, it requires an OSM file 
and a profile file eg. `scripts/OSRM import/profile.lua`
* `profile2prepare.sh` to transform an already uploaded OSM file to OSRM
* `unzip.sh` to unpack a zipfile and do a simple check to see what kind of 
files are in it and what the next step should be

Work is currently being done to create an administrator interface to manage 
projects and create new projects. This interface can be accessed via `web/admin.html`

# The main files in more detail

## index.js

dependencies

### loadConfig

The application requires a config to function, this function will load the 
configuration file into the global PROJECTS variable and create the required 
directories in the ./web/data directory. 

### Authorization/Authentication

The most important authorization/authentication is handled with socketio-auth since the data transfer all goes through the websockets. (However the websockets are not yet secured, which requires SSL certificates). This means that all authorized communication is wrapped in the `postAuthenticate` callback. However the whole `./web` folder is a static webserver and a basic layer of authentication is added to that with basic-auth. 

This means that the system is *not* (yet) highly secure

### uploader

This function is most in flux currently. Originally the idea was to upload a zipfile with a shapefile, translation file and a profile file, check if it was a zipfile (by checking the extension) and pass it on to a bash script that would generate the required OSRM file. This turned into a zipfile with either the original 3 filetypes, or an OSM file and with profile file or just a profile file. Depending on the content of the zipfile different bash scripts should be called.

However the administration interface requires a number of different files to get uploaded as well. Luckily the administration interface is more strict in its uploads and these uploads are given metadata of the type of file being uploaded. Depending on the meta.type a different message is sent to the client.

When uploading a file it is nice to keep track of the progress. However the socketio uploader *client* keeps track of loading the file into memory, not the actual upload which gives counterintuitive results on slower uploads. As such the better way is to keep track of the data received on the serverside. This is done with the `progress` function.

Once the upload has finished a message is sent back to the client with the filename and the type of file. This is especially useful for the admin interface which requires this information to generate a config file.

### postAuthenticate

socket
createTimeMatrix

## CalculteETA.js



## project.html

## result.html

## admin.html
