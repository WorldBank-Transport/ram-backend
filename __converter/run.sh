#!/bin/bash

docker rm rra-converter

# The ip for the connection must be the local machine ip in the docker network
# connection. Run `ifconfig` and check the `docker0`

docker run \
  -e 'DB_URI=postgresql://rra:rra@172.17.0.1:5432/rra' \
  -e 'PROJECT_ID=2' \
  -e 'SCENARIO_ID=2' \
  -e 'STORAGE_HOST=172.17.0.1' \
  -e 'STORAGE_PORT=9000' \
  -e 'STORAGE_ENGINE=minio' \
  -e 'STORAGE_ACCESS_KEY=minio' \
  -e 'STORAGE_SECRET_KEY=miniostorageengine' \
  -e 'STORAGE_BUCKET=rra' \
  -e 'STORAGE_REGION=us-east-1' \
  --name rra-converter \
  rra-converter
