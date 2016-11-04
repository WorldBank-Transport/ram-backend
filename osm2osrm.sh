#!/bin/bash



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

WORKDIR=${PWD}


cd $DIR

ln -s ${WORKDIR}/../osrm-backend/profiles/lib lib

osrm-extract *.osm 1>&2 
osrm-contract *.osrm 1>&2 

timestamp=$(date +%s)

cd $WORKDIR
cd $DIR
cd ../maps

mkdir $timestamp
cd $WORKDIR
cd $DIR
mv *.os* ../maps/$timestamp
mv *.lua ../maps/$timestamp
cd ../maps

if [ -f  ${timestamp}/*.osrm ]
 then
   ls ${timestamp}/*.osrm
   ls ${timestamp}/*.osm
   ls ${timestamp}/*.lua
else
  echo 'fail'
fi
#clean up after ourselves
cd $WORKDIR
rm -r $DIR