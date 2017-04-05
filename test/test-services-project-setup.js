'use strict';
import { assert } from 'chai';
import path from 'path';

import db from '../app/db';
import { setupStructure as setupDdStructure } from '../app/db/structure';
import { bucket } from '../app/s3/';
import { setupStructure as setupStorageStructure, putObjectFromFile } from '../app/s3/structure';
import { projectPendingWithAllFiles } from './utils/data';
import Operation from '../app/utils/operation';
import { startFinishSetupProcess } from '../app/services/project-setup/project-setup';

const FILE_ROAD_NETWORK = path.join(__dirname, 'utils/road-network-changeset-small.osm');

describe.only('Finish Project Setup', function () {
  before(function (done) {
    setupDdStructure()
      .then(() => setupStorageStructure())
      .then(() => projectPendingWithAllFiles(3333))
      // Replace the road-network file.
      .then(() => putObjectFromFile(bucket, `scenario-3333/road-network_000000`, FILE_ROAD_NETWORK))
      .then(() => done());
  });

  it('should process the project files to finish the setup', function (done) {
    this.slow(250);
    // There needs to be an ongoing operation to start the script.
    // Operation is fully tested on another file so it's safe to use.
    let op = new Operation(db);
    op.start('project-setup-finish', 3333, 3333)
      .then(() => op.log('start', {message: 'Operation started'}))
      .then(() => {
        const validate = () => {
          // Project should be active.
          // Scenario should be active.
          // Scenario should have admin areas.
          // Operation should be complete.
          // There should be 5 operation logs.
          Promise.all([
            db('projects')
              .where('id', 3333)
              .first()
              .then(proj => {
                assert.equal(proj.status, 'active');
              }),
            db('scenarios')
              .where('id', 3333)
              .first()
              .then(scenario => {
                assert.equal(scenario.status, 'active');
                let adminAreas = [
                  {'name': 'Distrito de Abadia', 'selected': false},
                  {'name': 'Distrito de Itanhi', 'selected': false},
                  {'name': 'Distrito de Conceição de Campinas', 'selected': false},
                  {'name': 'Distrito de Sambaíba', 'selected': false},
                  {'name': 'Distrito de Buril', 'selected': false},
                  {'name': 'Distrito de Itamira', 'selected': false},
                  {'name': 'Estância', 'selected': false},
                  {'name': 'Itaporanga d\'Ajuda', 'selected': false},
                  {'name': 'Salgado', 'selected': false},
                  {'name': 'Arauá', 'selected': false},
                  {'name': 'Boquim', 'selected': false},
                  {'name': 'Cristinápolis', 'selected': false},
                  {'name': 'Indiaroba', 'selected': false},
                  {'name': 'Itabaianinha', 'selected': false},
                  {'name': 'Pedrinhas', 'selected': false},
                  {'name': 'Santa Luzia do Itanhy', 'selected': false},
                  {'name': 'Tomar do Geru', 'selected': false},
                  {'name': 'Umbaúba', 'selected': false},
                  {'name': 'Pedra Mole', 'selected': false},
                  {'name': 'Campo do Brito', 'selected': false},
                  {'name': 'Itabaiana', 'selected': false},
                  {'name': 'Lagarto', 'selected': false},
                  {'name': 'Macambira', 'selected': false},
                  {'name': 'Poço Verde', 'selected': false},
                  {'name': 'Simão Dias', 'selected': false},
                  {'name': 'São Domingos', 'selected': false},
                  {'name': 'Palmares', 'selected': false},
                  {'name': 'Riachão do Dantas', 'selected': false},
                  {'name': 'Samambaia', 'selected': false},
                  {'name': 'Tobias Barreto', 'selected': false}
                ];
                assert.deepEqual(scenario.admin_areas, adminAreas);
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
                assert.lengthOf(logs, 5);
                assert.equal(logs[0].code, 'start');
                assert.equal(logs[0].data.message, 'Operation started');
                assert.equal(logs[1].code, 'process:admin-bounds');
                assert.equal(logs[1].data.message, 'Processing admin areas');
                assert.equal(logs[2].code, 'process:road-network');
                assert.equal(logs[2].data.message, 'Road network processing started');
                assert.equal(logs[3].code, 'process:road-network');
                assert.equal(logs[3].data.message, 'Road network processing finished');
                assert.equal(logs[4].code, 'success');
                assert.equal(logs[4].data.message, 'Operation complete');
              })
          ])
          .then(() => done())
          .catch(err => done(err));
        };

        // Start.
        let data = {
          opId: op.getId(),
          projId: 3333,
          scId: 3333,
          successTerminator: validate,
          errorTerminator: (err) => {
            try {
              assert.fail('The script ended in error' + err);
            } catch (e) {
              done(e);
            }
          }
        };
        startFinishSetupProcess(data);
      });
  });
});
