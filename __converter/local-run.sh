#!/bin/bash

# Create work folder
mkdir conversion
echo "disk=/var/tmp/stxxl,2500,memory" > ./conversion/.stxxl
ln -s ../node_modules/osrm/profiles/lib/ ./conversion/lib

export 'DB_URI=postgresql://rra:rra@172.17.0.1:5432/rra'
export 'PROJECT_ID=2000'
export 'SCENARIO_ID=2000'
export 'STORAGE_HOST=172.17.0.1'
export 'STORAGE_PORT=9000'
export 'STORAGE_ENGINE=minio'
export 'STORAGE_ACCESS_KEY=minio'
export 'STORAGE_SECRET_KEY=miniostorageengine'
export 'STORAGE_BUCKET=rra'
export 'STORAGE_REGION=us-east-1'
export 'CONVERSION_DIR=./conversion'

node index.js