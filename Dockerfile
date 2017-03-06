FROM node:6-alpine
ADD . /dist
WORKDIR /dist
RUN npm install
