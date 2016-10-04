#!/bin/bash
set -x

echo "Preparing fixtures data for test"

ln -s $(pwd)/test/fixtures/data $(pwd)/web/data
cd web/data

osmosis --rbf JM.pbf --wx JM.osm
