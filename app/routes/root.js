'use strict';

module.exports = [
  {
    path: '/',
    method: 'GET',
    config: {
      auth: false
    },
    handler: (request, reply) => {
      reply({
        statusCode: 200,
        message: 'In the beginning the Universe was created. This has made a lot of people very upset and been widely regarded as a bad move.'
      });
    }
  }
];
