#!/bin/bash
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
  CREATE DATABASE ramtest;
  CREATE ROLE ramtest WITH LOGIN PASSWORD 'ramtest';
  GRANT ALL PRIVILEGES ON DATABASE "ramtest" TO ramtest;
EOSQL