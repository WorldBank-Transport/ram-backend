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
rm -r tmp
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

echo "done"