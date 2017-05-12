#!/bin/sh

echo 'Installing the dependencies'
apt-get -qq update
apt-get -qq install -y \
  curl \
  build-essential \
  apt-transport-https \
  ca-certificates \
  software-properties-common

# install nodejs
curl -sL https://deb.nodesource.com/setup_6.x | bash -
apt-get -qq install -y nodejs

# add Docker repository
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | apt-key add -
add-apt-repository \
       "deb [arch=amd64] https://download.docker.com/linux/ubuntu \
       $(lsb_release -cs) \
       stable"

# install yarn repository
curl -sS https://dl.yarnpkg.com/debian/pubkey.gpg | apt-key add -
echo "deb https://dl.yarnpkg.com/debian/ stable main" | tee /etc/apt/sources.list.d/yarn.list

apt-get -qq update
apt-get -qq install -y yarn
apt-get -qq install -y docker-ce

# allow Docker to be used without sudo
groupadd docker
usermod -aG docker $USER

# install Hyper
curl -sL https://hyper-install.s3.amazonaws.com/hyper-linux-x86_64.tar.gz | tar xzf -
chmod +x hyper
mv ./hyper /usr/local/bin

# install dependencies for ogr2osm
apt-get -qq install -y python-gdal python-lxml