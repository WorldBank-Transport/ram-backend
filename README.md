<h1 align="center">RAM Backend</h1>

The Rural Accessibility Map allows you to assess the accessibility of rural populations in relation to critical services. Using the [Open Source Routing Machine](http://project-osrm.org), calculates travel times from population centers to the nearest POI.
This repository contains the main backend of the project with the API, database and file storage.

Apart from the RAM Backend, the tool relies on the following projects:

1. [ram-frontend](https://github.com/WorldBank-Transport/ram-frontend) with the code for the user interface
2. [ram-datapipeline](https://github.com/WorldBank-Transport/ram-datapipeline) that handles some of the more intensive data processing
3. [ram-iD](https://github.com/WorldBank-Transport/ram-iD), a customized version of iD - the popular OSM editor - to allow editing of the road network

## Deploying a stack
More information on how to run a RAM stack on AWS can be found in [ram-deployment](https://github.com/WorldBank-Transport/ram-deployment).

## Offline usage
To run RAM analysis locally, follow these steps. On first time setup:

1. clone this repository
2. install the project dependencies: node 8, Docker, Docker Compose - [more on project dependencies](#install-project-dependencies)
3. `yarn install`
4. `docker network create --driver=bridge --subnet=172.99.99.0/24 --gateway=172.99.99.1 ram` to set up the Docker network
5. `docker-compose up -d` to start the full eco-system in the background
6. `docker exec ram-api yarn run setup -- --db --bucket` to setup the database and file storage. If you want to start the server with example data, run `docker exec ram-api yarn run setup -- --data` instead - [more on setup](#setup)

Once this is done, you can access RAM in your browser on: http://localhost:8080

After the first time setup, use `docker-compose down` and `docker-compose up -d` to bring the containers down and back up again.

## Local development environment
To set up a local development environment, it may be easier to run the API outside of a container. To do so, follow these steps:

1. install Node 8, Docker, Docker Compose, python-gdal, python-lxml - [more on project dependencies](#install-project-dependencies)
2. `yarn install` - [more on application dependencies](#install-application-dependencies)
3. add configuration variables to `app/config/local.js`. The [example config](#config-example) should work well.
4. `docker network create ram` to set up the Docker network
5. `docker-compose -f docker-compose-dev.yml up -d` to start the database and bucket in the background - [more on starting the containers](#starting-the-containers)
6. `yarn start` to start the app - [more on starting the app](#starting-the-app)
7. `yarn run setup -- --db --bucket` to setup the database and file storage. If you want to start the server with example data, run `yarn run setup -- --data` instead - [more on setup](#setup)

This will provide access to the API through http://localhost:4000.

### Install Project Dependencies
To set up the development environment for this website, you'll need to install the following on your system:

- [Node](http://nodejs.org/) v8.x (To manage multiple node versions we recommend [nvm](https://github.com/creationix/nvm))
- [Yarn](https://yarnpkg.com/) Package manager
- [Docker](https://www.docker.com/products/docker) and [Docker Compose](https://docs.docker.com/compose/install/) v1.10.0
- python-gdal and python-lxml to generate OSM Change files (eg. `$ apt-get install -y python-gdal python-lxml`)

### Install Application Dependencies

If you use [`nvm`](https://github.com/creationix/nvm), activate the desired Node version:

```
nvm install
```

Install Node modules:

```
yarn install
```

### Configuration
All the config files can be found in `app/config`.
After installing the projects there will be 4 main files:
  - `test.js` - Used for testing. There is typically no need to modify this file.
  - `local.js` - Used only for local development. On production this file should not exist or be empty.

Some of the following options are overridable by environment variables, expressed between [].
The following options must be set:

  - `instanceId` - The RAM instance id. Should be unique. [INSTANCE_ID]
  - `connection.host` - The host. (mostly cosmetic. Default to 0.0.0.0). [PORT]
  - `connection.port` - The port where the app runs. (Default 4000). [HOST]
  - `auth` - Authentication strategy object
  - `auth.strategy` - `jwt` or `none` (see "Auth0" section for more details)
  - `auth.audience` - JWT resource server namespace in case of `jwt`
  - `auth.issuer` - JWT issuer URL in case of `jwt`
  - `db` - The database connection string. [DB_URI]
  - `osmP2PDir` - The folder to store the osm-p2p dbs. [OSM_P2P_DIR]
  - `storage` - Object with storage related settings. Has to be s3 compatible.
  - `storage.host` - The host to use. (Default 0.0.0.0). [STORAGE_HOST]
  - `storage.port` - The port to use. (Default 0.0.0.0). [STORAGE_PORT]
  - `storage.engine` - The storage engine to use. Either `minio` or `s3`. [STORAGE_ENGINE]
  - `storage.accessKey` - Access key for the storage. [STORAGE_ACCESS_KEY]
  - `storage.secretKey` - Secret key for storage. [STORAGE_SECRET_KEY]
  - `storage.bucket` - Secret key for storage. [STORAGE_BUCKET]
  - `storage.region` - Secret key for storage. [STORAGE_REGION]
  - `analysisProcess.service` - The service to run the analysis on. Either `docker` (for local development and off-line) or `aws` (only if running with Amazon Web Services through `ram-deployment`). [ANL_SERVICE]
  - `analysisProcess.container` - The name of the ram-analysis container (Default wbtransport/ram-analysis:latest-stable) [ANL_CONTAINER]
  - `analysisProcess.db` - The database connection string. When using Docker for the analysis process, the host will be the name of the database container (`ram-postgis`). [ANL_DB]
  - `analysisProcess.storageHost` - The host of the storage service. When using Docker, this will be the name of the storage container (`ram-minio`). [ANL_STORAGE_HOST]
  - `analysisProcess.storagePort` - The port to use. [ANL_STORAGE_PORT]
  - `vtProcess.service` - The service to run the vector tiles on. Either `docker` (for local development and off-line) or `aws` (only if running with Amazon Web Services through `ram-deployment`). [VT_SERVICE]
  - `vtProcess.container` - The name of the ram-vt container (Default wbtransport/ram-vt:latest-stable) [VT_CONTAINER]
  - `vtProcess.storageHost` - The host of the storage service. When using Docker, this will be the name of the storage container (`ram-minio`). [VT_STORAGE_HOST]
  - `vtProcess.storagePort` - The port to use. [VT_STORAGE_PORT]
  - `rahExport.ghRepo` - Repo where exports for rah should be placed (formatted as user/repo). [RAH_GH_REPO]
  - `rahExport.ghToken` - Token to interact with GH api. This token needs to have write access to the repo. [RAH_GH_TOKEN]
  - `rahExport.ghPath` - Base path in the repo where to store the exports (no leading or trailing slashes). A folder with the project id will be created. [RAH_GH_PATH]
  - `rahExport.committerName` - Committer's name (optional).  [RAH_CNAME]
  - `rahExport.committerEmail` - Committer's email (optional).  [RAH_CEMAIL]
  - `rahExport.authorName` - Author's name (optional).  [RAH_ANAME]
  - `rahExport.authorEmail` - Author's email (optional).  [RAH_AEMAIL]
  - `roadNetEditMax` - The size in bytes until which the road network can be be edited in browser. When the road network exceeds the size, network editing is disabled. [ROAD_NET_EDIT_MAX]

#### Config Example
```
module.exports = {
  instanceId: null, // Change me!
  connection: {
    host: '0.0.0.0',
    port: 4000
  },
  auth: {
    strategy: 'none'
  },
  db: 'postgresql://ram:ram@localhost:5432/ram',
  osmP2PDir: `${__dirname}/../../osm-p2p-dbs`,
  storage: {
    host: '0.0.0.0',
    port: 9000,
    engine: 'minio',
    accessKey: 'minio',
    secretKey: 'miniostorageengine',
    bucket: 'ram',
    region: 'us-east-1'
  },
  analysisProcess: {
    service: 'docker',
    container: 'wbtransport/ram-analysis:latest-dev',
    db: 'postgresql://ram:ram@ram-postgis:5432/ram',
    storageHost: 'ram-minio',
    storagePort: 9000
  },
  vtProcess: {
    service: 'docker',
    container: 'wbtransport/ram-vt:latest-dev',
    storageHost: 'ram-minio',
    storagePort: 9000
  },
  rahExport: {
    ghRepo: 'WorldBank-Transport/rah',
    ghToken: null',
    ghPath: 'app/assets/content/projects',
    committerName: null,
    committerEmail: null,
    authorName: null,
    authorEmail: null
  },
  roadNetEditMax: 20 * Math.pow(1024, 2) // 20MB
};
```

#### Auth0 configuration

In the case of `jwt` auth, requests include signed access tokens that are issued by an OAuth provider. [More information](https://auth0.com/docs/jwks)

Example of auth key with JWT (in this case Auth0 is the issuer):

```
auth: {
  strategy: 'jwt',
  audience: 'http://api',
  issuer: 'https://example.auth0.com/' #URL should have an endslash
}
```

1. Create a new auth0 account, the `issuer` parameter in the configuration will be `https://<account_name>.auth0.com/`
2. In the APIs section, create a new API and provide a name and an identifier. The "identifier" will be used as the `audience` parameter in the configuration

**Disable auth**
For development purposes it might be easier to disable authentication altogether. To do this simply set `auth.strategy` to `none` using the config or the env variable `AUTH_STRATEGY`. Note that auth must be disabled on the client as well.

#### Rural Accessibility Hub
The [Rural Accessibility Hub (RAH)](http://rah.surge.sh/about) is a central hub to showcase and share accessibility analysis generated using different RAM instances.
After running the analysis, users can export the results to RAH while providing some meta information about them. After a project is exported it will need to be approved by a RAH maintainer before it appears on the website. The list of pending projects can be seen on [Github's Pull Request page](https://github.com/WorldBank-Transport/rah/pulls).
To setup RAM for integration with RAH, add the config variables under `rahExport` and set a unique `instanceId`.

### Setup
Both the database and the local storage need some setup.

```
yarn run setup -- --db --bucket
```

Will prepare all the needed tables for the database and the bucket for storage. Both the database and the bucket will be removed and created anew. **Data will be lost.**

Other available options:
- `--db` - Sets up the db structure.
- `--bucket` - Sets up the storage bucket.
- `--data` - Sets up database and data fixtures. This also sets up the db and bucket, so it's not needed to be used with the previous commands.

Full setup with fixtures example:
*(The `--` is important and can't be omitted)*
```
yarn run setup -- --data
```

### Docker network
Set up the Docker network by running:

```
docker network create --driver=bridge --subnet=172.99.99.0/24 --gateway=172.99.99.1 ram
```
*Note: If the network already exists remove it using `docker network rm ram` and run the command again.*

This allows containers that are not part of the Docker Compose file to connect to the database and storage more easily. This includes the container that spins up the OSRM analysis.

### Starting the containers

Start the docker containers in the background:
```
docker-compose up -d
```
Stop the docker containers with:
```
docker-compose stop
```

The containers will store the information within themselves. If the container is deleted all the information will be lost.
[Minio](https://minio.io) can be used to store the files locally as an alternative to AWS S3. This is particularly useful for local development. Its interface will be available at `http://localhost:9000`.


### Starting the app
```
yarn run nodemon
```
This will start the app at `http://localhost:4000`.
This command starts the server with `nodemon` which watches files and restarts when there's a change.

```
yarn start
```
Starts the app without file watching
