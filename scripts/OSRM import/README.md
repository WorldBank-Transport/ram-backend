### Importing .osm file into OSRM

Download and build the [osrm-backend](https://github.com/Project-OSRM/osrm-backend). Link the profile and profile-lib directory in the osrm-backend build directory

```
ln -s profile.lua ~/osrm-backend/build/profile.lua
ln -s ~/osrm-backend/lib/ ~/osrm-backend/build/lib/
```

copy or link the osm file in the build directory and make sure it is named map.osm 

Create a .stxxl file which fits your computer configuration. See the [wiki](https://github.com/Project-OSRM/osrm-backend/wiki/Running-OSRM) for more details. Not stated on the wiki is the 'memory' access_method. This is the fastest method but obviously requires enough memory to do the whole process in memory. This is the .stxxl file I have used on a 3GB linux machine with the 700MB Guizhou OSM file:

```
disk=/var/tmp/stxxl,2500,memory
```

Finally run the extract and prepare tools:

```
./osrm-extract map.osm
./osrm-contract map.osrm
```

This will take a few minutes depending on your configuration and the data. You will end up with a series of map.osrm.* files. These are the prepared OSRM files, you need to copy these files to the the `data` directory of the RRA application and configure it to point to `map.osrm`.