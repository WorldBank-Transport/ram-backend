#!/bin/bash
set -x

echo "Preparing fixtures data for test"
cd $(pwd)/web/data

echo "Installing osmosis"
wget http://bretth.dev.openstreetmap.org/osmosis-build/osmosis-latest.tgz
mkdir osmosis
mv osmosis-latest.tgz osmosis
cd osmosis
tar xvfz osmosis-latest.tgz
rm osmosis-latest.tgz
chmod a+x bin/osmosis
osrm_dir=$(pwd)/bin
cd ../project_1463767649122/baseline

echo "Creating OSM & OSRM files"
rm *.os*m *.log
$osrm_dir/osmosis --rbf JM.pbf --wx JM.osm
osrm-extract JM.osm
osrm-contract JM.osrm

echo "Extracting villages and POIs from OSM"
#TODO

echo "Adding fake population"
#TODO
