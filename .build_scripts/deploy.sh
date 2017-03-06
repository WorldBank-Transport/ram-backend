#!/bin/bash
set -e

echo "Building source image"
docker build -t $DOCKER_SRC_IMAGE .

docker login -u="$DOCKER_USERNAME" -p="$DOCKER_PASSWD"

echo "Pushing image to Docker Hub:$TRAVIS_COMMIT"
docker tag $DOCKER_SRC_IMAGE $DOCKER_REPOSITORY:$TRAVIS_COMMIT
docker push $DOCKER_REPOSITORY:$TRAVIS_COMMIT

if [[ $TRAVIS_BRANCH == ${DEVELOP_BRANCH} ]]; then
  LATEST_TAG=latest-dev
elif [[ $TRAVIS_BRANCH == ${STABLE_BRANCH} ]]; then
  LATEST_TAG=latest-stable
fi

echo "Also pushing as :$LATEST_TAG"
docker tag $DOCKER_SRC_IMAGE $DOCKER_REPOSITORY:$LATEST_TAG
docker push $DOCKER_REPOSITORY:$LATEST_TAG
