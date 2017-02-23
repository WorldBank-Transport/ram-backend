#!/bin/bash
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
  CREATE DATABASE rratest;
  CREATE ROLE rratest WITH LOGIN PASSWORD 'rratest';
  GRANT ALL PRIVILEGES ON DATABASE "rratest" TO rratest;
EOSQL