'use strict';
import Joi from 'joi';
import Boom from 'boom';
import Promise from 'bluebird';
import Zip from 'node-zip';

import db from '../db/';
import { getFileContents } from '../s3/utils';
import { FileNotFoundError } from '../utils/errors';

module.exports = [
  {
    path: '/projects/{projId}/scenarios/{scId}/results',
    method: 'GET',
    config: {
      validate: {
        params: {
          projId: Joi.number(),
          scId: Joi.number()
        },
        query: {
          download: Joi.boolean().truthy('true').falsy('false')
        }
      }
    },
    handler: (request, reply) => {
      if (!request.query.download) {
        return reply(Boom.notImplemented('Query parameter "download" missing'));
      }

      const { projId, scId } = request.params;

      db('scenarios_files')
        .select('*')
        .where('project_id', projId)
        .where('scenario_id', scId)
        .where('type', 'results')
        .then(files => {
          if (!files.length) throw new FileNotFoundError('Results not found');
          return files;
        })
        // Match file metadata with their content.
        .then(files => {
          return Promise.map(files, f => getFileContents(f.path))
            .then(filesData => files.map((f, i) => {
              f.content = filesData[i];
              return f;
            }));
        })
        // Zip the files.
        .then(files => {
          let zip = new Zip();
          files.forEach(f => {
            zip.file(`${f.name}.csv`, f.content);
          });

          return zip.generate({ base64: false, compression: 'DEFLATE' });
        })
        // Send!
        .then(data => reply(data)
          .type('application/zip')
          .encoding('binary')
          .header('Content-Disposition', `attachment; filename=results-p${projId}s${scId}.zip`)
        )
        .catch(FileNotFoundError, e => reply(Boom.notFound(e.message)))
        .catch(err => {
          if (err.code === 'NoSuchKey') {
            return reply(Boom.notFound('File not found in storage bucket'));
          }
          console.log('err', err);
          reply(Boom.badImplementation(err));
        });
    }
  }
];
