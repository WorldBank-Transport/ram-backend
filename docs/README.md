# Documentation for the Rural Road Accessibility (RRA) project

The RRA application will generate a CSV file with the travel time to the nearest point of interest for each village. It will also provide an interactive dashboard where one can view graphs created with this CSV file.

## Preparing the application

Create a folder `data` in the folder `web` and add a `config.json` this file contains the locations of various relevant files and the names of relevant attributes. I the future the admin interface will create and maintain this file.

```
"name": the name of your project
"villages": file name of the villages geojson, relative to the project dir
"pois": an object with the POI types and their files:
    {
        "hospitals": "POIs/hospitals.geojson",
    },
"population" : the attribute name with the population
"stats": a list of POI types you want to show in the results summary plus the number of minutes:
    [        
        { "poi": "counties", "minutes": 60 }
    ],
"levels": a list of administrative boundaries you want to use to generate statistics on, each level contains: name, file and geometry ID:
    [
        {
            "name":"Local",
            "file":"local.geojson",
            "geometryId":"localID"
        }
    ],
"thumbnail": geojson file with the thumbnail geometry
"baseline": an object containing the default road network, cannot be deleted. Also it currently needs to be created by hand:
    {
        "name": "baseline",
        "dir": "./web/data/project_1463767649122/baseline",
        "files": {
            "osm": "baseline.osm",
            "profile": "profile.lua",
            "osrm": "baseline.osrm"
        },
        "created": {
            "time":1463767649122,
            "user":"steven"
        },
        "uid": "map_1463767649122"
    },
"created": creation date of the project in unix timestamp
"uid": id of the project; project_ + creation date
"maxSpeed": maximum travelspeed
"maxTime": maximum traveltime (change this only for really non dense areas)
"activeOSRM": for future use, just copy the same info as in "baseline"
```

