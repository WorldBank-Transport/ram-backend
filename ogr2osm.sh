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

shopt -s nocaseglob
for s in *.shp; do 
 SHAPEFILE=${s}
done
for p in *.py; do 
 TRANSLATE=${p}
done
shopt -u nocaseglob
python ${WORKDIR}/../ogr2osm/ogr2osm.py "${SHAPEFILE}" -t "${TRANSLATE}"
if [ -f *.osm ]
  then
  echo "done"
else 
  echo "fail"
fi