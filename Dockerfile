FROM ubuntu:16.04
ADD . /dist
WORKDIR /dist
RUN bash install.sh
RUN npm install --unsafe-perm
