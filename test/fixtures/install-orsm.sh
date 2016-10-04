#!/bin/bash
set -x

echo "Installing osrm-backend dependencies..."
sudo apt-get install build-essential git cmake pkg-config \
libbz2-dev libstxxl-dev libstxxl1 libxml2-dev \
libzip-dev libboost-all-dev lua5.1 liblua5.1-0-dev libluabind-dev libtbb-dev

echo "Installing osrm-backend..."
git clone https://github.com/Project-OSRM/osrm-backend.git
mkdir –p Project-OSRM/build
cd Project-OSRM/build
cmake ..
make
sudo make install
