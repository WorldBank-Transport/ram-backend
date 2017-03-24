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

pwd

OSRM_EXTRACT="$(realpath .)/node_modules/osrm/lib/binding/osrm-extract"
OSRM_CONTRACT="$(realpath .)/node_modules/osrm/lib/binding/osrm-contract"

echo $OSRM_EXTRACT;

cd $DIR

pwd

# We need the  lib and the .stxll files in the results directory as well.
ln -s ../lib . &> /dev/null
ln -s ../.stxxl . &> /dev/null

$OSRM_EXTRACT -p profile.lua road-network.osm
$OSRM_CONTRACT road-network.osrm