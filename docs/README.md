# Documentation for the Rural Road Accessibility (RRA) project

The RRA application will generate a CSV file with the travel time to the nearest point of interest for each village. It will also provide an interactive dashboard where one can view graphs created with this CSV file.

## Preparing the application

Currently RRA can generate accessibility statistics when given three datasets:

1. Road network
2. Villages list
3. Points of Interest (POI) list(s) - accessibility statistics will be generated for each POI list

### 1. Road network
The RRA application uses a routing engine to calculate the travel time between villages and POIs. To do so, the road network data has to be prepared specifically for the Open Source Routing Machine (OSRM) used by RRA.

The road network needs to be in OpenStreetMap (OSM) format, this can either be .osm XML file or a .pbf binary OSM file. Documentation how to convert shape files to OSM can be found [here](../scripts/Shapefile to OSM/README.md). It is important to translate attributes in the shape file to the correct tags in the .osm file for the travel time calculations.

The tags in the OSM road network are used by the routing software to set the maximum speed on road segments. This is controlled by a profile file which translates tags to rules for the routing engine. Documentation on how to import an .osm file into osrm can be found [here](../scripts/OSRM import/README.md). This is a two step process, first extract the roads from the .osm file and then contract the road network into a routing-graph. 

The result of these two steps is a series of *.osrm* files which are needed by the actual RRA application. Point to the *.osrm file in the [timematrix.js](../scripts/node/timematrix.js) file.

### 2. Villages list 
The villages list has to be a GeoJSOn file with a list of points with the center of the village and optional extra attributes. The location of the villages GeojsOn should also be configured in the  [timematrix.js](../scripts/node/timematrix.js) file.

### 3. POI list(s)
For each POI type (eg hospitals) a separate GeoJSON file should be created with a list of points with the location of the POI. In the [timematrix.js](../scripts/node/timematrix.js) file you need to create an attribute in the POI object for each POI type and configure the location of the GeoJSON.

## Creating the CSV file
The RRA application uses the timematrix service to calculate the travel distance to the nearest POI for each village within the given geometry (eg county or province). Currently you can control this service with a very rudimentary client, however as defined in #13 a control client will be created to handle this in a better way. To start the timematrix service make sure it is properly configured (as explained above) and go to the root of the project and type:
```
npm install
cd scripts/node
node timematrix.js
```
Once the timematrix service has started you can start the main application by going to the root of the project en type:
```
node index.js
```
This will start a webservice on port 8888 so point your browser to http://localhost:8888 if you run it locally to view the main application.