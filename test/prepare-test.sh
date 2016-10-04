#!/bin/bash
set -x

echo "Preparing fixtures data for test"

cp -r $(pwd)/test/fixtures/data $(pwd)/web/data
cd $(pwd)/web/data

wget http://bretth.dev.openstreetmap.org/osmosis-build/osmosis-latest.tgz
mkdir osmosis
mv osmosis-latest.tgz osmosis
cd osmosis
tar xvfz osmosis-latest.tgz
rm osmosis-latest.tgz
chmod a+x bin/osmosis
cd ../

osmosis/bin/osmosis --rbf JM.pbf --wx JM.osm
