#!/bin/bash
set -x

echo "Installing osrm-backend dependencies..."
sudo apt-get install cmake libblkid-dev e2fslibs-dev libboost-all-dev libaudit-dev
sudo apt-get install build-essential git cmake pkg-config \
libbz2-dev libstxxl-dev libstxxl1 libxml2-dev \
libzip-dev libboost-all-dev lua5.2 liblua5.2-0-dev libluabind-dev libtbb-dev

echo "Installing osrm-backend..."
git clone https://github.com/Project-OSRM/osrm-backend.git
mkdir –p osrm-backend/build
cd osrm-backend/build
cmake ..
make
sudo make install

pkg-config libosrm --variable=prefix
npm install osrm --build-from-source
