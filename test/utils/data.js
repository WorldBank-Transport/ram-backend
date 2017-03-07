'use strict';
import Promise from 'bluebird';
import _ from 'lodash';
import path from 'path';

import db from '../../app/db';
import { bucket } from '../../app/s3/';
import { putObjectFromFile } from '../../app/s3/structure';

const FILE = path.join(__dirname, 'test-file');
const FILE_SCENARIO_1200 = path.join(__dirname, 'test-file-scenario-1200');

// Project in pending state with one scenario.
export function project1000 () {
  return project({
    'id': 1000,
    'name': 'Project 1000',
    'description': 'Project in pending state with one scenario',
    'status': 'pending',
    'created_at': '2017-02-01T12:00:01.000Z',
    'updated_at': '2017-02-01T12:00:01.000Z'
  })
  .then(() => scenario({
    'id': 1000,
    'name': 'Main scenario',
    'description': 'Ghost scenario created when the project was created',
    'status': 'pending',
    'project_id': 1000,
    'master': true,
    'created_at': '2017-02-01T12:00:01.000Z',
    'updated_at': '2017-02-01T12:00:01.000Z'
  }));
}

// Project 1002 in pending state with one scenario
export function project1002 () {
  return project({
    'id': 1002,
    'name': 'Project 1002',
    'description': 'Project 1002 in pending state with one scenario',
    'status': 'pending',
    'created_at': '2017-02-01T12:00:02.000Z',
    'updated_at': '2017-02-01T12:00:02.000Z'
  })
  .then(() => scenario({
    'id': 1002,
    'name': 'Main scenario 1002',
    'description': 'Ghost scenario 1002 created when the project 1002 was created',
    'status': 'pending',
    'project_id': 1002,
    'master': true,
    'created_at': '2017-02-01T12:00:02.000Z',
    'updated_at': '2017-02-01T12:00:02.000Z'
  }));
}

// Project in pending state with one scenario and a profile file
export function project1001 () {
  return project({
    'id': 1001,
    'name': 'Project 1001',
    'description': 'Project in pending state with one scenario and a profile file',
    'status': 'pending',
    'created_at': '2017-02-01T12:00:03.000Z',
    'updated_at': '2017-02-01T12:00:03.000Z'
  })
  .then(() => projectFile({
    'id': 1001,
    'name': 'profile_000000',
    'type': 'profile',
    'path': 'project-1001/profile_000000',
    'project_id': 1001,
    'created_at': '2017-02-01T12:00:03.000Z',
    'updated_at': '2017-02-01T12:00:03.000Z'
  }))
  .then(() => putObjectFromFile(bucket, 'project-1001/profile_000000', FILE))
  .then(() => scenario({
    'id': 1001,
    'name': 'Main scenario',
    'description': 'Ghost scenario created when the project was created. Has a poi file',
    'status': 'pending',
    'project_id': 1001,
    'master': true,
    'created_at': '2017-02-01T12:00:03.000Z',
    'updated_at': '2017-02-01T12:00:03.000Z'
  }))
  .then(() => scenarioFile({
    'id': 1001,
    'name': 'poi_000000',
    'type': 'poi',
    'path': 'scenario-1001/poi_000000',
    'project_id': 1001,
    'scenario_id': 1001,
    'created_at': '2017-02-01T12:00:03.000Z',
    'updated_at': '2017-02-01T12:00:03.000Z'
  }))
  .then(() => putObjectFromFile(bucket, 'scenario-1001/poi_000000', FILE));
}

// Project 1003 in pending state with one scenario and a villages file
export function project1003 () {
  return project({
    'id': 1003,
    'name': 'Project 1003',
    'description': 'Project 1003 in pending state with one scenario and a villages file',
    'status': 'pending',
    'created_at': '2017-02-01T12:00:04.000Z',
    'updated_at': '2017-02-01T12:00:04.000Z'
  })
  .then(() => projectFile({
    'id': 1003,
    'name': 'villages_000000',
    'type': 'villages',
    'path': 'project-1003/villages_000000',
    'project_id': 1003,
    'created_at': '2017-02-01T12:00:04.000Z',
    'updated_at': '2017-02-01T12:00:04.000Z'
  }))
  .then(() => putObjectFromFile(bucket, 'project-1003/villages_000000', FILE))
  .then(() => scenario({
    'id': 1003,
    'name': 'Main scenario 1003',
    'description': 'Ghost scenario 1003 created when the project 1003 was created. Has a road-network file',
    'status': 'pending',
    'project_id': 1003,
    'master': true,
    'created_at': '2017-02-01T12:00:04.000Z',
    'updated_at': '2017-02-01T12:00:04.000Z'
  }))
  .then(() => scenarioFile({
    'id': 1003,
    'name': 'road-network_000000',
    'type': 'road-network',
    'path': 'scenario-1003/road-network_000000',
    'project_id': 1003,
    'scenario_id': 1003,
    'created_at': '2017-02-01T12:00:04.000Z',
    'updated_at': '2017-02-01T12:00:04.000Z'
  }))
  .then(() => putObjectFromFile(bucket, 'scenario-1003/road-network_000000', FILE));
}

// Project 1004 in pending state with one scenarios and all files
export function project1004 () {
  return project({
    'id': 1004,
    'name': 'Project 1004',
    'description': 'Project 1004 in pending state with one scenarios and all files',
    'status': 'pending',
    'created_at': '2017-02-01T12:00:05.000Z',
    'updated_at': '2017-02-01T12:00:05.000Z'
  })
  .then(() => projectFile([
    {
      'id': 1004,
      'name': 'profile_000000',
      'type': 'profile',
      'path': 'project-1004/profile_000000',
      'project_id': 1004,
      'created_at': '2017-02-01T12:00:05.000Z',
      'updated_at': '2017-02-01T12:00:05.000Z'
    },
    {
      'id': 1005,
      'name': 'villages_000000',
      'type': 'villages',
      'path': 'project-1004/villages_000000',
      'project_id': 1004,
      'created_at': '2017-02-01T12:00:05.000Z',
      'updated_at': '2017-02-01T12:00:05.000Z'
    },
    {
      'id': 1006,
      'name': 'admin-bounds_000000',
      'type': 'admin-bounds',
      'path': 'project-1004/admin-bounds_000000',
      'project_id': 1004,
      'created_at': '2017-02-01T12:00:05.000Z',
      'updated_at': '2017-02-01T12:00:05.000Z'
    }
  ]))
  .then(() => putObjectFromFile(bucket, 'project-1004/profile_000000', FILE))
  .then(() => putObjectFromFile(bucket, 'project-1004/villages_000000', FILE))
  .then(() => putObjectFromFile(bucket, 'project-1004/admin-bounds_000000', FILE))
  .then(() => scenario({
    'id': 1004,
    'name': 'Main scenario 1004',
    'description': 'Ghost scenario 1004 created when the project 1004 was created. Has all files',
    'status': 'pending',
    'project_id': 1004,
    'master': true,
    'created_at': '2017-02-01T12:00:05.000Z',
    'updated_at': '2017-02-01T12:00:05.000Z'
  }))
  .then(() => scenarioFile([
    {
      'id': 1004,
      'name': 'road-network_000000',
      'type': 'road-network',
      'path': 'scenario-1004/road-network_000000',
      'project_id': 1004,
      'scenario_id': 1004,
      'created_at': '2017-02-01T12:00:05.000Z',
      'updated_at': '2017-02-01T12:00:05.000Z'
    },
    {
      'id': 1005,
      'name': 'poi_000000',
      'type': 'poi',
      'path': 'scenario-1004/poi_000000',
      'project_id': 1004,
      'scenario_id': 1004,
      'created_at': '2017-02-01T12:00:05.000Z',
      'updated_at': '2017-02-01T12:00:05.000Z'
    }
  ]))
  .then(() => putObjectFromFile(bucket, 'scenario-1004/road-network_000000', FILE))
  .then(() => putObjectFromFile(bucket, 'scenario-1004/poi_000000', FILE));
}

// Project 1100 in active state with one scenarios and all files
export function project1100 () {
  return project({
    'id': 1100,
    'name': 'Project 1100',
    'description': 'Project 1100 in active state with one scenarios and all files',
    'status': 'active',
    'created_at': '2017-02-01T12:00:06.000Z',
    'updated_at': '2017-02-01T12:00:06.000Z'
  })
  .then(() => projectFile([
    {
      'id': 1100,
      'name': 'profile_000000',
      'type': 'profile',
      'path': 'project-1100/profile_000000',
      'project_id': 1100,
      'created_at': '2017-02-01T12:00:06.000Z',
      'updated_at': '2017-02-01T12:00:06.000Z'
    },
    {
      'id': 1101,
      'name': 'villages_000000',
      'type': 'villages',
      'path': 'project-1100/villages_000000',
      'project_id': 1100,
      'created_at': '2017-02-01T12:00:06.000Z',
      'updated_at': '2017-02-01T12:00:06.000Z'
    },
    {
      'id': 1102,
      'name': 'admin-bounds_000000',
      'type': 'admin-bounds',
      'path': 'project-1100/admin-bounds_000000',
      'project_id': 1100,
      'created_at': '2017-02-01T12:00:06.000Z',
      'updated_at': '2017-02-01T12:00:06.000Z'
    }
  ]))
  .then(() => putObjectFromFile(bucket, 'project-1100/profile_000000', FILE))
  .then(() => putObjectFromFile(bucket, 'project-1100/villages_000000', FILE))
  .then(() => putObjectFromFile(bucket, 'project-1100/admin-bounds_000000', FILE))
  .then(() => scenario({
    'id': 1100,
    'name': 'Main scenario 1100',
    'description': 'Scenario 1100 created when the project 1100 was created. Has all files',
    'status': 'active',
    'project_id': 1100,
    'master': true,
    'created_at': '2017-02-01T12:00:06.000Z',
    'updated_at': '2017-02-01T12:00:06.000Z'
  }))
  .then(() => scenarioFile([
    {
      'id': 1100,
      'name': 'road-network_000000',
      'type': 'road-network',
      'path': 'scenario-1100/road-network_000000',
      'project_id': 1100,
      'scenario_id': 1100,
      'created_at': '2017-02-01T12:00:06.000Z',
      'updated_at': '2017-02-01T12:00:06.000Z'
    },
    {
      'id': 1101,
      'name': 'poi_000000',
      'type': 'poi',
      'path': 'scenario-1100/poi_000000',
      'project_id': 1100,
      'scenario_id': 1100,
      'created_at': '2017-02-01T12:00:06.000Z',
      'updated_at': '2017-02-01T12:00:06.000Z'
    }
  ]))
  .then(() => putObjectFromFile(bucket, 'scenario-1100/road-network_000000', FILE))
  .then(() => putObjectFromFile(bucket, 'scenario-1100/poi_000000', FILE));
}

// Project 1200 in active state with 2 scenarios
export function project1200 () {
  return project({
    'id': 1200,
    'name': 'Project 1200',
    'description': 'Project 1200 in active state with 2 scenarios',
    'status': 'active',
    'created_at': '2017-02-01T12:00:07.000Z',
    'updated_at': '2017-02-01T12:00:07.000Z'
  })
  .then(() => projectFile([
    {
      'id': 1200,
      'name': 'profile_000000',
      'type': 'profile',
      'path': 'project-1200/profile_000000',
      'project_id': 1200,
      'created_at': '2017-02-01T12:00:07.000Z',
      'updated_at': '2017-02-01T12:00:07.000Z'
    },
    {
      'id': 1201,
      'name': 'villages_000000',
      'type': 'villages',
      'path': 'project-1200/villages_000000',
      'project_id': 1200,
      'created_at': '2017-02-01T12:00:07.000Z',
      'updated_at': '2017-02-01T12:00:07.000Z'
    },
    {
      'id': 1202,
      'name': 'admin-bounds_000000',
      'type': 'admin-bounds',
      'path': 'project-1200/admin-bounds_000000',
      'project_id': 1200,
      'created_at': '2017-02-01T12:00:07.000Z',
      'updated_at': '2017-02-01T12:00:07.000Z'
    }
  ]))
  .then(() => putObjectFromFile(bucket, 'project-1200/profile_000000', FILE))
  .then(() => putObjectFromFile(bucket, 'project-1200/villages_000000', FILE))
  .then(() => putObjectFromFile(bucket, 'project-1200/admin-bounds_000000', FILE))
  .then(() => scenario([
    {
      'id': 1200,
      'name': 'Main scenario 1200',
      'description': 'Scenario 1200 created when the project 1200 was created',
      'status': 'active',
      'project_id': 1200,
      'master': true,
      'created_at': '2017-02-01T12:00:07.000Z',
      'updated_at': '2017-02-01T12:00:07.000Z'
    },
    {
      'id': 1201,
      'name': 'Scenario 1201',
      'description': 'Scenario 1201 created when the project 1200 was created',
      'status': 'active',
      'project_id': 1200,
      'master': false,
      'created_at': '2017-02-01T12:00:07.000Z',
      'updated_at': '2017-02-01T12:00:07.000Z'
    }
  ]))
  .then(() => scenarioFile([
    {
      'id': 1200,
      'name': 'road-network_000000',
      'type': 'road-network',
      'path': 'scenario-1200/road-network_000000',
      'project_id': 1200,
      'scenario_id': 1200,
      'created_at': '2017-02-01T12:00:07.000Z',
      'updated_at': '2017-02-01T12:00:07.000Z'
    },
    {
      'id': 1201,
      'name': 'poi_000000',
      'type': 'poi',
      'path': 'scenario-1200/poi_000000',
      'project_id': 1200,
      'scenario_id': 1200,
      'created_at': '2017-02-01T12:00:07.000Z',
      'updated_at': '2017-02-01T12:00:07.000Z'
    },
    {
      'id': 1202,
      'name': 'road-network_000000',
      'type': 'road-network',
      'path': 'scenario-1201/road-network_000000',
      'project_id': 1200,
      'scenario_id': 1201,
      'created_at': '2017-02-01T12:00:07.000Z',
      'updated_at': '2017-02-01T12:00:07.000Z'
    },
    {
      'id': 1203,
      'name': 'poi_000000',
      'type': 'poi',
      'path': 'scenario-1201/poi_000000',
      'project_id': 1200,
      'scenario_id': 1201,
      'created_at': '2017-02-01T12:00:07.000Z',
      'updated_at': '2017-02-01T12:00:07.000Z'
    }
  ]))
  .then(() => putObjectFromFile(bucket, 'scenario-1200/road-network_000000', FILE_SCENARIO_1200))
  .then(() => putObjectFromFile(bucket, 'scenario-1200/poi_000000', FILE_SCENARIO_1200))
  .then(() => putObjectFromFile(bucket, 'scenario-1201/road-network_000000', FILE))
  .then(() => putObjectFromFile(bucket, 'scenario-1201/poi_000000', FILE));
}

//
// Insert all the projects above.
//

export function fixMeUp () {
  return Promise.all([
    project1000(),
    project1002(),
    project1001(),
    project1003(),
    project1004(),
    project1100(),
    project1200()
  ]);
}

//
// Helper function for data insertion.
//

function project (data) {
  return db.batchInsert('projects', _.isArray(data) ? data : [data]);
}

function projectFile (data) {
  return db.batchInsert('projects_files', _.isArray(data) ? data : [data]);
}

function scenario (data) {
  return db.batchInsert('scenarios', _.isArray(data) ? data : [data]);
}

function scenarioFile (data) {
  return db.batchInsert('scenarios_files', _.isArray(data) ? data : [data]);
}

//
// Functions for project creation.
//

// Insert a project and the ghost scenario
export function projectBarebones (id) {
  return project({
    'id': id,
    'name': `Project ${id}`,
    'description': 'Project in pending state with one scenario.',
    'status': 'pending',
    'created_at': '2017-02-01T12:00:00.000Z',
    'updated_at': '2017-02-01T12:00:00.000Z'
  })
  .then(() => scenario({
    'id': id,
    'name': 'Main scenario',
    'description': 'Ghost scenario created when the project was created.',
    'status': 'pending',
    'project_id': id,
    'master': true,
    'created_at': '2017-02-01T12:00:00.000Z',
    'updated_at': '2017-02-01T12:00:00.000Z'
  }));
}

// Insert a project, a scenario, a project file and a scenario file.
export function projectPendingWithFiles (id) {
  return project({
    'id': id,
    'name': `Full project ${id}`,
    'description': 'Project in pending state with one scenario and a profile file',
    'status': 'pending',
    'created_at': '2017-02-01T12:00:00.000Z',
    'updated_at': '2017-02-01T12:00:00.000Z'
  })
  .then(() => projectFile({
    'id': id,
    'name': 'profile_000000',
    'type': 'profile',
    'path': `project-${id}/profile_000000`,
    'project_id': id,
    'created_at': '2017-02-01T12:00:00.000Z',
    'updated_at': '2017-02-01T12:00:00.000Z'
  }))
  .then(() => putObjectFromFile(bucket, `project-${id}/profile_000000`, FILE))
  .then(() => scenario({
    'id': id,
    'name': `Scenario ${id}`,
    'description': `Ghost scenario ${id} created when the project ${id} was created. Has a poi file`,
    'status': 'pending',
    'project_id': id,
    'master': true,
    'created_at': '2017-02-01T12:00:00.000Z',
    'updated_at': '2017-02-01T12:00:00.000Z'
  }))
  .then(() => scenarioFile({
    'id': id,
    'name': 'poi_000000',
    'type': 'poi',
    'path': `scenario-${id}/poi_000000`,
    'project_id': id,
    'scenario_id': id,
    'created_at': '2017-02-01T12:00:00.000Z',
    'updated_at': '2017-02-01T12:00:00.000Z'
  }))
  .then(() => putObjectFromFile(bucket, `scenario-${id}/poi_000000`, FILE));
}

// Insert a project, a scenario, and all files.
export function projectPendingWithAllFiles (id) {
  return project({
    'id': id,
    'name': `Full project ${id}`,
    'description': 'Project in pending state with one scenario and a profile file',
    'status': 'pending',
    'created_at': '2017-02-01T12:00:00.000Z',
    'updated_at': '2017-02-01T12:00:00.000Z'
  })
  .then(() => projectFile([
    {
      'id': id,
      'name': 'profile_000000',
      'type': 'profile',
      'path': `project-${id}/profile_000000`,
      'project_id': id,
      'created_at': '2017-02-01T12:00:07.000Z',
      'updated_at': '2017-02-01T12:00:07.000Z'
    },
    {
      'id': id + 1,
      'name': 'villages_000000',
      'type': 'villages',
      'path': `project-${id}/villages_000000`,
      'project_id': id,
      'created_at': '2017-02-01T12:00:07.000Z',
      'updated_at': '2017-02-01T12:00:07.000Z'
    },
    {
      'id': id + 2,
      'name': 'admin-bounds_000000',
      'type': 'admin-bounds',
      'path': `project-${id}/admin-bounds_000000`,
      'project_id': id,
      'created_at': '2017-02-01T12:00:07.000Z',
      'updated_at': '2017-02-01T12:00:07.000Z'
    }
  ]))
  .then(() => putObjectFromFile(bucket, `project-${id}/profile_000000`, FILE))
  .then(() => putObjectFromFile(bucket, `project-${id}/villages_000000`, FILE))
  .then(() => putObjectFromFile(bucket, `project-${id}/admin-bounds_000000`, FILE))
  .then(() => scenario({
    'id': id,
    'name': `Scenario ${id}`,
    'description': `Ghost scenario ${id} created when the project ${id} was created. Has a poi file`,
    'status': 'pending',
    'project_id': id,
    'master': true,
    'created_at': '2017-02-01T12:00:00.000Z',
    'updated_at': '2017-02-01T12:00:00.000Z'
  }))
  .then(() => scenarioFile([
    {
      'id': id,
      'name': 'road-network_000000',
      'type': 'road-network',
      'path': `scenario-${id}/road-network_000000`,
      'project_id': id,
      'scenario_id': id,
      'created_at': '2017-02-01T12:00:06.000Z',
      'updated_at': '2017-02-01T12:00:06.000Z'
    },
    {
      'id': id + 1,
      'name': 'poi_000000',
      'type': 'poi',
      'path': `scenario-${id}/poi_000000`,
      'project_id': id,
      'scenario_id': id,
      'created_at': '2017-02-01T12:00:06.000Z',
      'updated_at': '2017-02-01T12:00:06.000Z'
    }
  ]))
  .then(() => putObjectFromFile(bucket, `scenario-${id}/road-network_000000`, FILE))
  .then(() => putObjectFromFile(bucket, `scenario-${id}/poi_000000`, FILE));
}
