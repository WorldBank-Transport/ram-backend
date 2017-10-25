'use strict';
import { assert } from 'chai';
import path from 'path';
import fs from 'fs-extra';

import config from '../app/config';
import db from '../app/db';
import { setupStructure as setupDdStructure } from '../app/db/structure';
import { bucket } from '../app/s3/';
import { setupStructure as setupStorageStructure, putObjectFromFile } from '../app/s3/structure';
import { projectPendingWithAllFiles } from './utils/data';
import Operation from '../app/utils/operation';
import { concludeProjectSetup } from '../app/services/project-setup/project-setup';

const FILE_ROAD_NETWORK = path.join(__dirname, 'utils/road-network-small.osm');
const INVALID_FILE_JSON = path.join(__dirname, 'utils/test-file.json');
const INVALID_FILE = path.join(__dirname, 'utils/test-file');

describe('Finish Project Setup', function () {
  before(function () {
    this.timeout(5000);
    return setupDdStructure()
      .then(() => setupStorageStructure())

      // Small valid road-network file.
      .then(() => projectPendingWithAllFiles(3000))
      .then(() => putObjectFromFile(bucket, `scenario-3000/road-network_000000`, FILE_ROAD_NETWORK))

      // Invalid admin bounds file. Still JSON though.
      .then(() => projectPendingWithAllFiles(3010))
      .then(() => putObjectFromFile(bucket, `project-3010/admin-bounds_000000`, INVALID_FILE_JSON))

      // Invalid road-network file. (not xml, just text)
      .then(() => projectPendingWithAllFiles(3020))
      .then(() => putObjectFromFile(bucket, `scenario-3020/road-network_000000`, INVALID_FILE));
  });

  it('should process the project files to finish the setup', function (done) {
    this.slow(1500);
    // There needs to be an ongoing operation to start the script.
    // Operation is fully tested on another file so it's safe to use.
    let op = new Operation(db);
    op.start('project-setup-finish', 3000, 3000)
      .then(() => op.log('start', {message: 'Operation started'}))
      .then(() => {
        const validate = () => {
          // Project should be active.
          // Project should have a bbox
          // Scenario should be active.
          // Scenario should have admin areas.
          // Operation should be complete.
          // There should be 5 operation logs.
          Promise.all([
            db('projects')
              .where('id', 3000)
              .first()
              .then(proj => {
                assert.equal(proj.status, 'active');
                assert.deepEqual(proj.bbox, [ -38.313, -11.89, -37.1525399, -10.5333431 ]);
              }),
            db('scenarios')
              .where('id', 3000)
              .first()
              .then(scenario => {
                assert.equal(scenario.status, 'active');
              }),
            db('scenarios_settings')
              .where('scenario_id', 3000)
              .where('key', 'admin_areas')
              .first()
              .then(setting => {
                assert.equal(setting.value, '[]');
              }),
            db('projects_aa')
              .select('name', 'project_id', 'type')
              .where('project_id', 3000)
              .then(aa => {
                let adminAreas = [
                  {'name': 'Arauá', 'type': 'boundary', 'project_id': 3000},
                  {'name': 'Boquim', 'type': 'boundary', 'project_id': 3000},
                  {'name': 'Campo do Brito', 'type': 'boundary', 'project_id': 3000},
                  {'name': 'Cristinápolis', 'type': 'boundary', 'project_id': 3000},
                  {'name': 'Distrito de Abadia', 'type': 'boundary', 'project_id': 3000},
                  {'name': 'Distrito de Buril', 'type': 'boundary', 'project_id': 3000},
                  {'name': 'Distrito de Conceição de Campinas', 'type': 'boundary', 'project_id': 3000},
                  {'name': 'Distrito de Itamira', 'type': 'boundary', 'project_id': 3000},
                  {'name': 'Distrito de Itanhi', 'type': 'boundary', 'project_id': 3000},
                  {'name': 'Distrito de Sambaíba', 'type': 'boundary', 'project_id': 3000},
                  {'name': 'Estância', 'type': 'boundary', 'project_id': 3000},
                  {'name': 'Indiaroba', 'type': 'boundary', 'project_id': 3000},
                  {'name': 'Itabaiana', 'type': 'boundary', 'project_id': 3000},
                  {'name': 'Itabaianinha', 'type': 'boundary', 'project_id': 3000},
                  {'name': 'Itaporanga d\'Ajuda', 'type': 'boundary', 'project_id': 3000},
                  {'name': 'Lagarto', 'type': 'boundary', 'project_id': 3000},
                  {'name': 'Macambira', 'type': 'boundary', 'project_id': 3000},
                  {'name': 'Palmares', 'type': 'boundary', 'project_id': 3000},
                  {'name': 'Pedra Mole', 'type': 'boundary', 'project_id': 3000},
                  {'name': 'Pedrinhas', 'type': 'boundary', 'project_id': 3000},
                  {'name': 'Poço Verde', 'type': 'boundary', 'project_id': 3000},
                  {'name': 'Riachão do Dantas', 'type': 'boundary', 'project_id': 3000},
                  {'name': 'Salgado', 'type': 'boundary', 'project_id': 3000},
                  {'name': 'Samambaia', 'type': 'boundary', 'project_id': 3000},
                  {'name': 'Santa Luzia do Itanhy', 'type': 'boundary', 'project_id': 3000},
                  {'name': 'São Domingos', 'type': 'boundary', 'project_id': 3000},
                  {'name': 'Simão Dias', 'type': 'boundary', 'project_id': 3000},
                  {'name': 'Tobias Barreto', 'type': 'boundary', 'project_id': 3000},
                  {'name': 'Tomar do Geru', 'type': 'boundary', 'project_id': 3000},
                  {'name': 'Umbaúba', 'type': 'boundary', 'project_id': 3000}
                ];
                assert.deepEqual(aa, adminAreas);
              }),
            db('operations')
              .where('id', op.getId())
              .first()
              .then(operation => {
                assert.equal(operation.status, 'complete');
              }),
            db('operations_logs')
              .where('operation_id', op.getId())
              .then(logs => {
                assert.lengthOf(logs, 8);
                assert.equal(logs[0].code, 'start');
                assert.equal(logs[0].data.message, 'Operation started');
                assert.equal(logs[1].code, 'process:origins');
                assert.equal(logs[1].data.message, 'Processing origins');
                assert.equal(logs[2].code, 'process:admin-bounds');
                assert.equal(logs[2].data.message, 'Processing admin areas');
                assert.equal(logs[3].code, 'process:road-network');
                assert.equal(logs[3].data.message, 'Road network processing started');
                assert.equal(logs[4].code, 'process:road-network');
                assert.equal(logs[4].data.message, 'Road network processing finished');
                assert.equal(logs[5].code, 'process:poi');
                assert.equal(logs[5].data.message, 'Poi processing started');
                assert.equal(logs[6].code, 'process:poi');
                assert.equal(logs[6].data.message, 'Poi processing finished');
                assert.equal(logs[7].code, 'success');
                assert.equal(logs[7].data.message, 'Operation complete');
              })
          ])
          // Delete osm p2p folder.
          .then(() => fs.remove(config.osmP2PDir))
          .then(() => done())
          .catch(err => done(err));
        };

        // Start.
        let data = {
          opId: op.getId(),
          projId: 3000,
          scId: 3000,
          callback: (err) => {
            if (err) {
              done(new Error('The script ended in error ' + err));
            } else {
              validate();
            }
          }
        };
        concludeProjectSetup(data);
      });
  });

  it('should error with invalid admin bounds file', function (done) {
    this.slow(250);
    // There needs to be an ongoing operation to start the script.
    // Operation is fully tested on another file so it's safe to use.
    let op = new Operation(db);
    op.start('project-setup-finish', 3010, 3010)
      .then(() => op.log('start', {message: 'Operation started'}))
      .then(() => {
        // Start.
        let data = {
          opId: op.getId(),
          projId: 3010,
          scId: 3010,
          callback: (err) => {
            if (err) {
              db('operations_logs')
                .where('operation_id', op.getId())
                .orderBy('id', 'desc')
                .then(logs => {
                  assert.equal(err, 'Invalid administrative boundaries file');
                  assert.lengthOf(logs, 3);
                  assert.equal(logs[0].code, 'error');
                  assert.equal(logs[0].data.error, 'Invalid administrative boundaries file');
                })
                .then(() => done())
                .catch(err => done(err));
            } else {
              done(new Error('The test should have failed but succeeded'));
            }
          }
        };

        concludeProjectSetup(data);
      });
  });

  // Without the import into osm-p2p-db the file is just uploaded
  // to the storage. No error will happen. Skipping for now.
  it.skip('should error with invalid road network file', function (done) {
    this.slow(250);
    this.timeout(5000);
    // There needs to be an ongoing operation to start the script.
    // Operation is fully tested on another file so it's safe to use.
    let op = new Operation(db);
    op.start('project-setup-finish', 3020, 3020)
      .then(() => op.log('start', {message: 'Operation started'}))
      .then(() => {
        // Start.
        let data = {
          opId: op.getId(),
          projId: 3020,
          scId: 3020,
          callback: (err) => {
            if (err) {
              db('operations_logs')
                .where('operation_id', op.getId())
                .orderBy('id', 'desc')
                .then(logs => {
                  assert.match(err, /OGR failed to open (.+)\/road-networkP3020S3020.osm, format may be unsupported/);
                  assert.lengthOf(logs, 4);
                  assert.equal(logs[0].code, 'error');
                  assert.match(logs[0].data.error, /OGR failed to open (.+)\/road-networkP3020S3020.osm, format may be unsupported/);
                })
                .then(() => done())
                .catch(err => done(err));
            } else {
              done(new Error('The test should have failed but succeeded'));
            }
          }
        };

        concludeProjectSetup(data);
      });
  });
});
