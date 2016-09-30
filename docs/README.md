# Documentation for the Rural Road Accessibility (RRA) project

The RRA application will generate a CSV file with the travel time to the nearest point of interest for each village. It will also provide an interactive dashboard where one can view graphs created with this CSV file.

## Preparing the application

Create a folder `data` in the folder `web` and add a `config.json` this file contains the locations of various relevant files and the names of relevant attributes. I the future the admin interface will create and maintain this file.

```
[{
    "name": "My first project",
    "villages": "villages.geojson",
    "pois": {
        "hospitals": "POIs/hospitals.geojson",
        "schools":  "POIs/schools.geojson",
        "banks": "POIs/banks.geojson",
        "counties": "POIs/counties.geojson",
        "prefectures": "POIs/prefectures.geojson"
    },
    "population" : "POP",
    "stats": [        
        { "poi": "counties", "minutes": 60 },
        { "poi": "hospitals", "minutes": 30 },
        { "poi": "banks", "minutes": 30 },
        { "poi": "schools", "minutes": 20 }
    ],
    "levels": [
        {
            "name":"Local",
            "file":"local.geojson",
            "geometryId":"localID"
        },
        {
            "name":"Prefecture",
            "file":"prefectures.geojson",
            "geometryId":"prefectureID"
        },
        {
            "name":"Province",
            "file":"province.geojson",
            "geometryId":"provinceID"
        }
    ],
    "thumbnail":"province.geojson",
    "baseline": {
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
    "created": 1463767649122,
    "uid":"project_1463767649122",
    "maxSpeed":120,
    "maxTime":3600,
    "activeOSRM":{
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
    }
}]
```