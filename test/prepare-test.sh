#!/bin/bash
set -x

echo "Preparing fixtures data for test"
cd $(pwd)/web/data
rra_dir=$(pwd)

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

#link lua and lib files
cp -r $osrm_dir/profiles/lib $osrm_dir/build/
cp "$rra_dir/scripts/OSRM\ import/profile.lua" ~/code/osrm-backend/build/
cd $rra_dir/web/data/project_1463767649122/baseline
$osrm_dir/build/osrm-extract JM.osm
$osrm_dir/build/osrm-contract JM.osrm

echo "Extracting villages and POIs from OSM"
#TODO

echo "Adding fake population"
#TODO
