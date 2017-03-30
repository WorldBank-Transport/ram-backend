# Overpass queries

Brief notes on how test data was generated. This fetches OSM data from Sergipe in Brazil and prepares it for use as sample data in RRA.
Note that bbox is in s,w,n,e.

To replicate this, you may need to install osmtogeojson `npm install osmtogeojson -g`.

## Admin boundaries

```
wget "http://overpass-api.de/api/interpreter?data=[out:xml];(node['place'~'town|hamlet'](-11.58632,-38.29284,-10.68085,-37.5););out body;" -O admin-boundaries.osm
```

Then `$ osmtogeojson admin-boundaries.osm > admin-boundaries.geojson`

## Village centers

```
wget "http://overpass-api.de/api/interpreter?data=[out:xml];(node['place'~'town|hamlet'](-11.58632,-38.29284,-10.68085,-37.5););out body;" -O villages.osm
```

Then `$ osmtogeojson villages.osm > villages.geojson`

## POI - Townhalls

```
wget "http://overpass-api.de/api/interpreter?data=[out:xml];(node['amenity'~'townhall'](-11.58632,-38.29284,-10.68085,-37.5););out body;" -O poi-townhalls.osm
```

Then `$ osmtogeojson poi-townhalls.osm > poi-townhalls.geojson`

## Road network

```
wget "http://overpass-api.de/api/interpreter?data=[out:xml];(way['highway'](-11.58632,-38.29284,-10.68085,-37.5););out body;" -O road-network.osm
```