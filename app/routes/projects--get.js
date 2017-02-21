'use strict';
import db from '../services/db';

module.exports = [
  {
    path: '/projects',
    method: 'GET',
    handler: (request, reply) => {
      let {page, limit} = request;
      let offset = (page - 1) * limit;

      db.select('*').from('projects').offset(offset).limit(limit)
        .then(res => {
          reply(res);
        });
    }
  }
];
