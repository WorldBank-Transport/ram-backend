FROM node:6
ADD . /dist
WORKDIR /dist
RUN bash install.sh
RUN npm install
