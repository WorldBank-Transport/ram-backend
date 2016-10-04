#!/bin/bash
set -x

echo "Preparing fixtures data for test"

cp -r $(pwd)/test/fixtures/data $(pwd)/web/data
cd $(pwd)/web/data
ls
osmosis --rbf JM.pbf --wx JM.osm
