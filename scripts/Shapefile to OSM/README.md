### Converting shapefiles to .osm files

The OSRM routing engine only takes .osm files, which means that the roadnetwork shapefiles need to be converted to .osm. Use [ogr2osm](http://wiki.openstreetmap.org/wiki/Ogr2osm) to convert shapefiles to .osm. You can use a translation file to help with the conversion. In the case of the Guizhou data there are various characters that trip OSRM, so I've removed all tags except id, class, county and township road upgrade status.

Copy the shapefile to the ogr2osm directory and copy guizhou.py to the ogr2osm/translations directory and run ogr2osm

```
python ogr2osm.py Guizhou_road_network_gcs_f.shp -t translations/guizhou.py

```

It will produce a .osm file with the same name as the input shapefile.