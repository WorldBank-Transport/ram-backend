#!/bin/sh

# install Hyper
wget https://hyper-install.s3.amazonaws.com/hyper-linux-x86_64.tar.gz
tar xzf hyper-linux-x86_64.tar.gz
chmod +x hyper
mv ./hyper /usr/local/bin
