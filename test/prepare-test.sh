#!/bin/bash
set -x

python_ver=$(python -c 'import sys; print(sys.version_info[0])')
if [[ $python_ver -ne 2 ]] ; then
    echo "node-gyp breaks when not on Python 2. Exiting..."
    exit 1
fi


echo "Preparing fixtures data for test"
ln -s test/fixtures/data web/data

rra_dir=$(pwd)
data_dir=$rra_dir/web/data/project_1463767649122/baseline
osrm_dir=$rra_dir/node_modules/osrm/lib/binding/


echo "Creating OSM & OSRM files"
unzip $data_dir/JM.zip -d $data_dir/

#link lua and lib files
mkdir -p $osrm_dir/build/
cp -r $osrm_dir/profiles/lib $osrm_dir/build/
cp "$rra_dir/scripts/OSRM import/profile.lua" $osrm_dir/
cd $data_dir
$osrm_dir/osrm-extract JM.osm
$osrm_dir/osrm-contract JM.osrm

echo "Extracting villages and POIs from OSM"
#TODO

echo "Adding fake population"
#TODO
