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

mkdir -p maps
mkdir -p tmp
unzip $FILE -d tmp 1>&2 
rm $FILE
cd tmp
find -name "* *" -type f | rename 's/ /_/g'
find -name "* *" -type f | rename 's/-/_/g'

for fname in *; do
  name="${fname%\.*}"
  extension="${fname#$name}"
  newname="${name//./_}"
  newfname="$newname""$extension"
  if [ "$fname" != "$newfname" ]; then
    mv "$fname" "$newfname"
  fi
done

shopt -s nocaseglob
for s in *.shp; do 
 SHAPEFILE=${s}
done
for p in *.py; do 
 TRANSLATE=${p}
done
shopt -u nocaseglob
echo "ogr2osm"
python "${WORKDIR}"/../ogr2osm/ogr2osm.py "${SHAPEFILE}" -t "${TRANSLATE}" --positive-id
echo "osrm"
mkdir -p ../tmposm
mv *.osm ../tmposm/. #TODO: will only work with 1 osm file
cp *.lua ../tmposm/.
ln -s "${WORKDIR}"/../osrm-backend/profiles/lib ../tmposm/lib
cd ../tmposm
osrm-extract *.osm 1>&2 
osrm-contract *.osrm 1>&2 

timestamp=$(date +%s)
#clean up after ourselves
cd "${WORKDIR}"
cd $DIR
cd maps
mkdir $timestamp
mv ../tmposm/*.osrm* $timestamp
echo "done"
cd ..
#TODO: remove the zip
# rm $FILE
# remove all the temp files
rm -r tmp
rm -r tmposm
cd "${WORKDIR}"
ls ${DIR}maps/${timestamp}/*.osrm