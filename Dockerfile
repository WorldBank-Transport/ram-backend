FROM ubuntu:16.04
ADD . /dist
WORKDIR /dist
RUN bash install.sh
RUN yarn install --unsafe-perm
