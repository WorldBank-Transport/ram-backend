#!/bin/bash
set -x

echo "Preparing fixtures data for test"
pwd
ls
ln -s ./test/fixtures/data ./web/data
cd ./web/data

osmosis --rbf JM.pbf --wx JM.osm
