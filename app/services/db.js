'use strict';
import knex from 'knex';

import config from '../config';

export default knex({
  client: 'pg',
  connection: config.db
});
