'use strict';
import knex from 'knex';

export default knex({
  client: 'pg',
  connection: process.env.DB_URI
});
