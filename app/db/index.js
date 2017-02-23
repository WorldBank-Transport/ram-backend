'use strict';
import knex from 'knex';

import config from '../config';

export default knex({
  client: 'pg',
  connection: process.env.DS_ENV === 'test' ? config.dbTest : config.db
});
