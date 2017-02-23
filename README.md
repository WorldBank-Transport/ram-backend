<h1 align="center">Rural-Road-Accessibility (RRA)</h1>

## Installation and Usage

The steps below will walk you through setting up your own instance of the rra.

### Install Project Dependencies
To set up the development environment for this website, you'll need to install the following on your system:

- [Node](http://nodejs.org/) v6.x (To manage multiple node versions we recommend [nvm](https://github.com/creationix/nvm))
- [Docker](https://www.docker.com/products/docker) and [Docker Compose](https://docs.docker.com/compose/install/)

### Install Application Dependencies

If you use [`nvm`](https://github.com/creationix/nvm), activate the desired Node version:

```
nvm install
```

Install Node modules:

```
npm install
```

Start the docker containers:
```
docker-compose up
```
Stop the docker containers with:
```
docker-compose stop
```

The containers will store the information within themselves. If the container is deleted all the information will be lost.
When using the application locally [Minio](https://minio.io/) is used as cloud storage to simulate S3. It's interface will be available at `http://localhost:9000`.

### Setup
Both the database and the local storage need some setup.
```
npm run setup
```
Will prepare all the needed tables for the database and the bucket for storage.

If data fixtures are needed for development run the following command instead:
```
npm run setup -- --data
```

### Usage

#### Config files
All the config files can be found in `app/assets/scripts/config`.
After installing the projects there will be 3 main files:
  - `local.js` - Used only for local development. On production this file should not exist or be empty.
  - `staging.js`
  - `production.js`

The `production.js` file serves as base and the other 2 will override it as needed:
  - `staging.js` will be loaded whenever the env variable `DS_ENV` is set to staging.
  - `local.js` will be loaded if it exists.

Some of the following options are overridable by environment variables, expressed between [].
The following options must be set: (The used file will depend on the context)
  - `connection.host` - The host. (mostly cosmetic. Default to 0.0.0.0). [PORT]
  - `connection.port` - The port where the app runs. (Default 4000). [HOST]
  - `db` - The database connection string. [DB_CONNECTION]
  - `dbTest` - The database connection string for testing. [DB_TEST_CONNECTION]
  - `storage.engine` - The storage engine to use. Either `minio` or `s3`. [STORAGE_ENGINE]
  - `storage.accessKey` - Access key for the storage. [STORAGE_ACCESS_KEY]
  - `storage.secretKey` - Secret key for storage. [STORAGE_SECRET_KEY]

Example:
``` 
module.exports = {
  connection: {
    host: '0.0.0.0',
    port: 4000
  },
  db: 'postgresql://rra:rra@localhost:5432/rra',
  dbTest: 'postgresql://rratest:rratest@localhost:5432/rratest',
  storage: {
    engine: 'minio',
    accessKey: 'minio',
    secretKey: 'miniostorageengine'
  }
};
```

#### Starting the app
```
npm run nodemon
```
This will start the app at `http://localhost:4000`.
This command starts the server with `nodemon` which watches files and restarts when there's a change.

```
npm start
```
Starts the app without file watching
