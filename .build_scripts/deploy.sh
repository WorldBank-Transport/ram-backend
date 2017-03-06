#!/bin/bash
set -e

# Setting correct variables based on the environment we're deploying to
if [[ $TRAVIS_BRANCH == ${DEVELOP_BRANCH} ]]; then
  LATEST_TAG=latest-dev
  ECS_CLUSTER=${AWS_ECS_CLUSTER_STAGING}
elif [[ $TRAVIS_BRANCH == ${STABLE_BRANCH} ]]; then
  LATEST_TAG=latest-stable
  ECS_CLUSTER=${AWS_ECS_CLUSTER}
fi

echo "Building source image"
docker build -t $DOCKER_SRC_IMAGE .

docker login -u="$DOCKER_USERNAME" -p="$DOCKER_PASSWD"

echo "Pushing image to Docker Hub:$TRAVIS_COMMIT"
docker tag $DOCKER_SRC_IMAGE $DOCKER_REPOSITORY:$TRAVIS_COMMIT
docker push $DOCKER_REPOSITORY:$TRAVIS_COMMIT

echo "Also pushing as :$LATEST_TAG"
docker tag $DOCKER_SRC_IMAGE $DOCKER_REPOSITORY:$LATEST_TAG
docker push $DOCKER_REPOSITORY:$LATEST_TAG

echo "Installing ecs-cli"
sudo curl -o /usr/local/bin/ecs-cli https://s3.amazonaws.com/amazon-ecs-cli/ecs-cli-linux-amd64-latest
sudo chmod +x /usr/local/bin/ecs-cli

echo "Building ECS task"
npm install yamljs
node .build_scripts/insert-env.js

echo "Configuring ECS client"
ecs-cli configure --region $AWS_REGION --access-key $AWS_ACCESS_KEY_ID --secret-key $AWS_SECRET_ACCESS_KEY --cluster $ECS_CLUSTER

echo "Stopping current ECS task"
ecs-cli compose --verbose --file docker-compose-generated.yml service stop

echo "Deploying to ECS"
ecs-cli compose --verbose --file docker-compose-generated.yml service up
