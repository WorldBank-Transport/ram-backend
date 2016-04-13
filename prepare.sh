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

mkdir tmp
unzip $FILE -d tmp 1>&2 
cd tmp

shopt -s nocaseglob
for s in *.shp; do 
 SHAPEFILE=${s}
done
for p in *.py; do 
 TRANSLATE=${p}
done
shopt -u nocaseglob

python ~/ogr2osm/ogr2osm.py "${SHAPEFILE}" -t "${TRANSLATE}" 1>&2 

mkdir ../tmposm
mv *.osm ../tmposm/.
cp *.lua ../tmposm/.
ln -s ~/osrm-backend/profiles/lib ../tmposm/lib
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
#TODO: remove the zip
# rm $FILE
# remove all the temp files
rm -r tmp
rm -r tmposm
cd $WORKDIR
ls ${DIR}maps/${timestamp}/*.osrm