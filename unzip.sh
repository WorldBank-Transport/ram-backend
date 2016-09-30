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

unzip $FILE -d $DIR 1>&2 

rm $FILE
cd $DIR
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
for f in *.shp; do 
 [ -e "$f" ] && SHAPEFILE="yes"|| SHAPEFILE="no"
 break;
done
for f in *.osm; do 
 [ -e "$f" ] && OSM="yes"|| OSM="no"
 break;
done
for f in *.lua; do 
[ -e "$f" ] && PROFILE="yes"|| PROFILE="no"
 break;
done
shopt -u nocaseglob


if [ "$SHAPEFILE" == "yes" ];
    then
    echo "shp"

elif [ "$OSM" == "yes" ];
    then
    echo "osm"

elif [ "$PROFILE" == "yes"  ];
    then
    echo "profile"

fi
