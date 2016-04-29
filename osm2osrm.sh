#!/bin/bash


while [[ $# > 1 ]]
do
key="$1"

case $key in
    -f|--file)
    FILE="$2"
    shift # past argument
    ;;
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

WORKDIR=${PWD}


cd $DIR
cd tmp
mkdir -p ../tmposm
mv *.osm ../tmposm/. #TODO: will only work with 1 osm file
cp *.lua ../tmposm/.
ln -s ${WORKDIR}/../osrm-backend/profiles/lib ../tmposm/lib
cd ../tmposm
osrm-extract *.osm 1>&2 
osrm-prepare *.osrm 1>&2 

timestamp=$(date +%s)
#clean up after ourselves
cd $WORKDIR
cd $DIR
cd maps
mkdir $timestamp
mv ../tmposm/*.osrm* $timestamp
cd ..
rm -r tmp
rm -r tmposm
cd $WORKDIR
if [ -f  ${DIR}maps/${timestamp}/*.osrm ]
 then
   ls ${DIR}maps/${timestamp}/*.osrm
else
  echo 'fail'
fi