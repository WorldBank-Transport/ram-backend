#!/bin/sh

while [[ $# > 1 ]]
do
key="$1"

case $key in
    -d|--dir)
    DIR="$2"
    shift # past argument
    ;;
    *)
            # unknown option
    ;;
esac
shift # past argument or value
done

cd $DIR

OSRM_EXTRACT="../node_modules/osrm/lib/binding/osrm-extract"
OSRM_CONTRACT="../node_modules/osrm/lib/binding/osrm-contract"

$OSRM_EXTRACT -p profile.lua road-network.osm
$OSRM_CONTRACT road-network.osrm