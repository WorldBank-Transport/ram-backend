#!/bin/bash
set -e

# Setting correct variables based on the environment we're deploying to
if [[ $TRAVIS_BRANCH == ${DEVELOP_BRANCH} ]]; then
  VERSION=latest-dev
elif [[ $TRAVIS_BRANCH == ${STABLE_BRANCH} ]]; then
  # Grab version from package.json and prepend with v (v0.5.0)
  VERSION=v$(grep -m1 version package.json | awk -F: '{ print $2 }' | sed 's/[", ]//g')
  # Attempt to add a git tag based on version in package.json. If
  # the tag already exists, git will fail and stop the build.
  if ! git tag ${VERSION} master
  then
    echo >&2 "Failed to tag a new release, skipping build. Did you update the version in package.json?"
    exit 1
  else
    # Push tag to Github
    git push origin ${VERSION}
  fi
fi

echo "Building source image"
docker build -t $DOCKER_SRC_IMAGE .

docker login -u="$DOCKER_USERNAME" -p="$DOCKER_PASSWD"

echo "Pushing image to Docker Hub:$TRAVIS_COMMIT"
docker tag $DOCKER_SRC_IMAGE $DOCKER_REPOSITORY:$TRAVIS_COMMIT
docker push $DOCKER_REPOSITORY:$TRAVIS_COMMIT

echo "Also pushing as :$VERSION"
docker tag $DOCKER_SRC_IMAGE $DOCKER_REPOSITORY:$VERSION
docker push $DOCKER_REPOSITORY:$VERSION
