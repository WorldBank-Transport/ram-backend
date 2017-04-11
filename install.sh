#!/bin/sh

apt-get update
apt-get install -y curl build-essential

# install nodejs
curl -sL https://deb.nodesource.com/setup_6.x | bash -
apt-get install -y nodejs

# install Hyper
curl -sL https://hyper-install.s3.amazonaws.com/hyper-linux-x86_64.tar.gz | tar xzf -
chmod +x hyper
mv ./hyper /usr/local/bin

# install dependencies for ogr2osm
apt-get install -y python-gdal python-lxml