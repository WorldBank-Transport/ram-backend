<h1 align="center">Rural-Road-Accessibility (RRA)</h1>

## Installation and Usage

The steps below will walk you through setting up your own instance of the rra.

### Install Project Dependencies
To set up the development environment for this website, you'll need to install the following on your system:

- [Node](http://nodejs.org/) v6.x (To manage multiple node versions we recommend [nvm](https://github.com/creationix/nvm))
- [Docker](https://www.docker.com/products/docker)

### Install Application Dependencies

If you use [`nvm`](https://github.com/creationix/nvm), activate the desired Node version:

```
nvm install
```

Install Node modules:

```
npm install
```

Install the docker container with the database:
```
docker run --name rra-postgis \
  -e POSTGRES_PASSWORD=rra \
  -e POSTGRES_USER=rra \
  -e POSTGRES_DB=rra \
  -p 5432:5432 \
  -d \
  mdillon/postgis
```

Once the container is installed use `docker stop rra-postgis` to stop it and `docker start rra-postgis` to start it again.

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

Example:
``` 
module.exports = {
  connection: {
    host: '0.0.0.0',
    port: 4000
  },
  db: 'rra:rra@localhost:5432/rra'
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

## Fixtures
To setup the database with dummy data run:

```
npm run setupdb
```

Note: This will remove the database and import the dummy data again.
