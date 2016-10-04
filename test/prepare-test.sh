#!/bin/bash
set -x

echo "Preparing fixtures data for test"

ln -s $(pwd)/test/fixtures/data $(pwd)/web/data
ls
cd $(pwd)/web/data
ls
osmosis --rbf JM.pbf --wx JM.osm
