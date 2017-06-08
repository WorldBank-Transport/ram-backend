'use strict';
import Promise from 'bluebird';
import _ from 'lodash';
import path from 'path';
import bbox from '@turf/bbox';
import fs from 'fs';

import db from '../../app/db';
import { bucket } from '../../app/s3/';
import { putObjectFromFile } from '../../app/s3/structure';

function readJSONSync (file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

const FILE_PROFILE = path.join(__dirname, 'data-sergipe/profile.lua');
const FILE_ORIGINS = path.join(__dirname, 'data-sergipe/villages.geojson');
const FILE_ADMIN = path.join(__dirname, 'data-sergipe/admin-boundaries.geojson');
const FILE_ROAD_NETWORK = path.join(__dirname, 'data-sergipe/road-network.osm');
const FILE_POI = path.join(__dirname, 'data-sergipe/poi-townhalls.geojson');

const ADMIN_AREAS_BBOX = bbox(readJSONSync(FILE_ADMIN));

// Parse admin areas.
let adminAreas = readJSONSync(FILE_ADMIN);
adminAreas = _(adminAreas.features)
  .filter(o => !!o.properties.name && o.geometry.type !== 'Point')
  .sortBy(o => _.kebabCase(o.properties.name))
  .map(o => {
    return {
      name: o.properties.name,
      type: o.properties.type || 'Admin Area',
      geometry: JSON.stringify(o.geometry.coordinates)
    };
  })
  .value();

export function getAdminAreasForProject (projId) {
  return _.cloneDeep(adminAreas).map((o, i) => {
    o.id = parseInt(`${projId}0${i + 1}`);
    o.project_id = projId;
    return o;
  });
}

export function getSelectedAdminAreas (projId) {
  return [13, 16, 21, 23].map(o => parseInt(`${projId}0${o}`));
}

// Parse origins.
let originsFC = readJSONSync(FILE_ORIGINS);
let neededProps = ['name', 'population'];
let originFeatures = originsFC.features.filter(feat => {
  let props = Object.keys(feat.properties);
  return neededProps.every(o => props.indexOf(o) !== -1);
});

export function getOriginsForProject (projId) {
  let originsIndicators = [];
  let origins = originFeatures.map((feat, idx) => {
    let id = parseInt(`${projId}0${idx + 1}`);

    let indicators = [
      {
        key: 'population',
        label: 'Total population'
      }
    ];
    let featureIndicators = indicators.map((ind, idx2) => ({
      id: parseInt(`${id}0${idx2 + 1}`),
      origin_id: id,
      key: ind.key,
      label: ind.label,
      value: parseInt(feat.properties[ind.key])
    }));
    originsIndicators = originsIndicators.concat(featureIndicators);

    return {
      id: id,
      project_id: projId,
      name: feat.properties.name,
      coordinates: JSON.stringify(feat.geometry.coordinates)
    };
  });

  return { originsIndicators, origins };
}

// ////////////////////////////////////////////////////////////////////////// //

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
  }))
  .then(() => scenarioSettings([
    {
      'scenario_id': 1000,
      'key': 'res_gen_at',
      'value': 0,
      'created_at': '2017-02-01T12:00:01.000Z',
      'updated_at': '2017-02-01T12:00:01.000Z'
    },
    {
      'scenario_id': 1000,
      'key': 'rn_updated_at',
      'value': 0,
      'created_at': '2017-02-01T12:00:01.000Z',
      'updated_at': '2017-02-01T12:00:01.000Z'
    }
  ]));
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
  }))
  .then(() => scenarioSettings([
    {
      'scenario_id': 1002,
      'key': 'res_gen_at',
      'value': 0,
      'created_at': '2017-02-01T12:00:01.000Z',
      'updated_at': '2017-02-01T12:00:01.000Z'
    },
    {
      'scenario_id': 1002,
      'key': 'rn_updated_at',
      'value': 0,
      'created_at': '2017-02-01T12:00:01.000Z',
      'updated_at': '2017-02-01T12:00:01.000Z'
    }
  ]));
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
  .then(() => putObjectFromFile(bucket, 'project-1001/profile_000000', FILE_PROFILE))
  .then(() => projectSourceData({
    'id': 1001,
    'name': 'profile',
    'type': 'file',
    'project_id': 1001
    // 'data':
  }))
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
  .then(() => scenarioSettings([
    {
      'scenario_id': 1001,
      'key': 'res_gen_at',
      'value': 0,
      'created_at': '2017-02-01T12:00:01.000Z',
      'updated_at': '2017-02-01T12:00:01.000Z'
    },
    {
      'scenario_id': 1001,
      'key': 'rn_updated_at',
      'value': 0,
      'created_at': '2017-02-01T12:00:01.000Z',
      'updated_at': '2017-02-01T12:00:01.000Z'
    }
  ]))
  .then(() => scenarioFile({
    'id': 1001,
    'name': 'poi_000000',
    'type': 'poi',
    'subtype': 'pointOfInterest',
    'path': 'scenario-1001/poi_000000',
    'project_id': 1001,
    'scenario_id': 1001,
    'created_at': '2017-02-01T12:00:03.000Z',
    'updated_at': '2017-02-01T12:00:03.000Z'
  }))
  .then(() => putObjectFromFile(bucket, 'scenario-1001/poi_000000', FILE_POI))
  .then(() => scenarioSourceData({
    'id': 1001,
    'name': 'poi',
    'type': 'file',
    'project_id': 1001,
    'scenario_id': 1001
    // 'data':
  }));
}

// Project 1003 in pending state with one scenario and a origins file
export function project1003 () {
  return project({
    'id': 1003,
    'name': 'Project 1003',
    'description': 'Project 1003 in pending state with one scenario and a origins file',
    'status': 'pending',
    'created_at': '2017-02-01T12:00:04.000Z',
    'updated_at': '2017-02-01T12:00:04.000Z'
  })
  .then(() => projectFile({
    'id': 1003,
    'name': 'origins_000000',
    'type': 'origins',
    'path': 'project-1003/origins_000000',
    'project_id': 1003,
    'data': {indicators: [ { key: 'population', label: 'Total population' } ]},
    'created_at': '2017-02-01T12:00:04.000Z',
    'updated_at': '2017-02-01T12:00:04.000Z'
  }))
  .then(() => putObjectFromFile(bucket, 'project-1003/origins_000000', FILE_ORIGINS))
  .then(() => projectSourceData({
    'id': 1003,
    'name': 'origins',
    'type': 'file',
    'project_id': 1003
    // 'data':
  }))
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
  .then(() => scenarioSettings([
    {
      'scenario_id': 1003,
      'key': 'res_gen_at',
      'value': 0,
      'created_at': '2017-02-01T12:00:01.000Z',
      'updated_at': '2017-02-01T12:00:01.000Z'
    },
    {
      'scenario_id': 1003,
      'key': 'rn_updated_at',
      'value': 0,
      'created_at': '2017-02-01T12:00:01.000Z',
      'updated_at': '2017-02-01T12:00:01.000Z'
    }
  ]))
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
  .then(() => putObjectFromFile(bucket, 'scenario-1003/road-network_000000', FILE_ROAD_NETWORK))
  .then(() => scenarioSourceData({
    'id': 1003,
    'name': 'road-network',
    'type': 'file',
    'project_id': 1003,
    'scenario_id': 1003
    // 'data':
  }));
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
      'name': 'origins_000000',
      'type': 'origins',
      'path': 'project-1004/origins_000000',
      'project_id': 1004,
      'data': {indicators: [ { key: 'population', label: 'Total population' } ]},
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
  .then(() => putObjectFromFile(bucket, 'project-1004/profile_000000', FILE_PROFILE))
  .then(() => putObjectFromFile(bucket, 'project-1004/origins_000000', FILE_ORIGINS))
  .then(() => putObjectFromFile(bucket, 'project-1004/admin-bounds_000000', FILE_ADMIN))
  .then(() => projectSourceData([
    {
      'id': 1004,
      'name': 'profile',
      'type': 'file',
      'project_id': 1004
      // 'data':
    },
    {
      'id': 1005,
      'name': 'origins',
      'type': 'file',
      'project_id': 1004
      // 'data':
    },
    {
      'id': 1006,
      'name': 'admin-bounds',
      'type': 'file',
      'project_id': 1004
      // 'data':
    }
  ]))
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
  .then(() => scenarioSettings([
    {
      'scenario_id': 1004,
      'key': 'res_gen_at',
      'value': 0,
      'created_at': '2017-02-01T12:00:01.000Z',
      'updated_at': '2017-02-01T12:00:01.000Z'
    },
    {
      'scenario_id': 1004,
      'key': 'rn_updated_at',
      'value': 0,
      'created_at': '2017-02-01T12:00:01.000Z',
      'updated_at': '2017-02-01T12:00:01.000Z'
    }
  ]))
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
      'subtype': 'pointOfInterest',
      'path': 'scenario-1004/poi_000000',
      'project_id': 1004,
      'scenario_id': 1004,
      'created_at': '2017-02-01T12:00:05.000Z',
      'updated_at': '2017-02-01T12:00:05.000Z'
    }
  ]))
  .then(() => putObjectFromFile(bucket, 'scenario-1004/road-network_000000', FILE_ROAD_NETWORK))
  .then(() => putObjectFromFile(bucket, 'scenario-1004/poi_000000', FILE_POI))
  .then(() => scenarioSourceData([
    {
      'id': 1004,
      'name': 'road-network',
      'type': 'file',
      'project_id': 1004,
      'scenario_id': 1004
      // 'data':
    },
    {
      'id': 1005,
      'name': 'poi',
      'type': 'file',
      'project_id': 1004,
      'scenario_id': 1004
      // 'data':
    }
  ]));
}

// Project 1100 in active state with one scenarios and all files
export function project1100 () {
  return project({
    'id': 1100,
    'name': 'Project 1100',
    'description': 'Project 1100 in active state with one scenarios and all files',
    'status': 'active',
    'bbox': JSON.stringify(ADMIN_AREAS_BBOX),
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
      'name': 'origins_000000',
      'type': 'origins',
      'path': 'project-1100/origins_000000',
      'project_id': 1100,
      'data': {indicators: [ { key: 'population', label: 'Total population' } ]},
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
  .then(() => projectAA(getAdminAreasForProject(1100)))
  .then(() => projectOrigins(getOriginsForProject(1100)))
  .then(() => putObjectFromFile(bucket, 'project-1100/profile_000000', FILE_PROFILE))
  .then(() => putObjectFromFile(bucket, 'project-1100/origins_000000', FILE_ORIGINS))
  .then(() => putObjectFromFile(bucket, 'project-1100/admin-bounds_000000', FILE_ADMIN))
  .then(() => projectSourceData([
    {
      'id': 1100,
      'name': 'profile',
      'type': 'file',
      'project_id': 1100
      // 'data':
    },
    {
      'id': 1101,
      'name': 'origins',
      'type': 'file',
      'project_id': 1100
      // 'data':
    },
    {
      'id': 1102,
      'name': 'admin-bounds',
      'type': 'file',
      'project_id': 1100
      // 'data':
    }
  ]))
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
  .then(() => scenarioSettings([
    {
      'scenario_id': 1100,
      'key': 'res_gen_at',
      'value': 0,
      'created_at': '2017-02-01T12:00:01.000Z',
      'updated_at': '2017-02-01T12:00:01.000Z'
    },
    {
      'scenario_id': 1100,
      'key': 'rn_updated_at',
      'value': 0,
      'created_at': '2017-02-01T12:00:01.000Z',
      'updated_at': '2017-02-01T12:00:01.000Z'
    },
    {
      'scenario_id': 1100,
      'key': 'admin_areas',
      'value': JSON.stringify(getSelectedAdminAreas(1100)),
      'created_at': '2017-02-01T12:00:01.000Z',
      'updated_at': '2017-02-01T12:00:01.000Z'
    }
  ]))
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
      'subtype': 'pointOfInterest',
      'path': 'scenario-1100/poi_000000',
      'project_id': 1100,
      'scenario_id': 1100,
      'created_at': '2017-02-01T12:00:06.000Z',
      'updated_at': '2017-02-01T12:00:06.000Z'
    }
  ]))
  .then(() => putObjectFromFile(bucket, 'scenario-1100/road-network_000000', FILE_ROAD_NETWORK))
  .then(() => putObjectFromFile(bucket, 'scenario-1100/poi_000000', FILE_POI))
  .then(() => scenarioSourceData([
    {
      'id': 1100,
      'name': 'road-network',
      'type': 'file',
      'project_id': 1100,
      'scenario_id': 1100
      // 'data':
    },
    {
      'id': 1101,
      'name': 'poi',
      'type': 'file',
      'project_id': 1100,
      'scenario_id': 1100
      // 'data':
    }
  ]));
}

// Project 1200 in active state with 2 scenarios
export function project1200 () {
  return project({
    'id': 1200,
    'name': 'Project 1200',
    'description': 'Project 1200 in active state with 2 scenarios',
    'status': 'active',
    'bbox': JSON.stringify(ADMIN_AREAS_BBOX),
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
      'name': 'origins_000000',
      'type': 'origins',
      'path': 'project-1200/origins_000000',
      'project_id': 1200,
      'data': {indicators: [ { key: 'population', label: 'Total population' } ]},
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
  .then(() => projectAA(getAdminAreasForProject(1200)))
  .then(() => projectOrigins(getOriginsForProject(1200)))
  .then(() => putObjectFromFile(bucket, 'project-1200/profile_000000', FILE_PROFILE))
  .then(() => putObjectFromFile(bucket, 'project-1200/origins_000000', FILE_ORIGINS))
  .then(() => putObjectFromFile(bucket, 'project-1200/admin-bounds_000000', FILE_ADMIN))
  .then(() => projectSourceData([
    {
      'id': 1200,
      'name': 'profile',
      'type': 'file',
      'project_id': 1200
      // 'data':
    },
    {
      'id': 1201,
      'name': 'origins',
      'type': 'file',
      'project_id': 1200
      // 'data':
    },
    {
      'id': 1202,
      'name': 'admin-bounds',
      'type': 'file',
      'project_id': 1200
      // 'data':
    }
  ]))
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
  .then(() => scenarioSettings([
    {
      'scenario_id': 1200,
      'key': 'res_gen_at',
      'value': 0,
      'created_at': '2017-02-01T12:00:01.000Z',
      'updated_at': '2017-02-01T12:00:01.000Z'
    },
    {
      'scenario_id': 1200,
      'key': 'rn_updated_at',
      'value': 0,
      'created_at': '2017-02-01T12:00:01.000Z',
      'updated_at': '2017-02-01T12:00:01.000Z'
    },
    {
      'scenario_id': 1200,
      'key': 'admin_areas',
      'value': JSON.stringify(getSelectedAdminAreas(1200)),
      'created_at': '2017-02-01T12:00:01.000Z',
      'updated_at': '2017-02-01T12:00:01.000Z'
    },
    {
      'scenario_id': 1201,
      'key': 'res_gen_at',
      'value': 0,
      'created_at': '2017-02-01T12:00:01.000Z',
      'updated_at': '2017-02-01T12:00:01.000Z'
    },
    {
      'scenario_id': 1201,
      'key': 'rn_updated_at',
      'value': 0,
      'created_at': '2017-02-01T12:00:01.000Z',
      'updated_at': '2017-02-01T12:00:01.000Z'
    },
    {
      'scenario_id': 1201,
      'key': 'admin_areas',
      'value': JSON.stringify(getSelectedAdminAreas(1200)),
      'created_at': '2017-02-01T12:00:01.000Z',
      'updated_at': '2017-02-01T12:00:01.000Z'
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
      'subtype': 'pointOfInterest',
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
      'subtype': 'pointOfInterest',
      'path': 'scenario-1201/poi_000000',
      'project_id': 1200,
      'scenario_id': 1201,
      'created_at': '2017-02-01T12:00:07.000Z',
      'updated_at': '2017-02-01T12:00:07.000Z'
    }
  ]))
  .then(() => putObjectFromFile(bucket, 'scenario-1200/road-network_000000', FILE_ROAD_NETWORK))
  .then(() => putObjectFromFile(bucket, 'scenario-1200/poi_000000', FILE_POI))
  .then(() => putObjectFromFile(bucket, 'scenario-1201/road-network_000000', FILE_ROAD_NETWORK))
  .then(() => putObjectFromFile(bucket, 'scenario-1201/poi_000000', FILE_POI))
  .then(() => scenarioSourceData([
    {
      'id': 1200,
      'name': 'road-network',
      'type': 'file',
      'project_id': 1200,
      'scenario_id': 1200
      // 'data':
    },
    {
      'id': 1201,
      'name': 'poi',
      'type': 'file',
      'project_id': 1200,
      'scenario_id': 1200
      // 'data':
    },
    {
      'id': 1202,
      'name': 'road-network',
      'type': 'file',
      'project_id': 1200,
      'scenario_id': 1201
      // 'data':
    },
    {
      'id': 1203,
      'name': 'poi',
      'type': 'file',
      'project_id': 1200,
      'scenario_id': 1201
      // 'data':
    }
  ]));
}

// Project 2000 in active state with one scenarios and all files.
// Files represent real data from Sergipe, Brazil
export function project2000 () {
  return project({
    'id': 2000,
    'name': 'Sergipe, Brazil',
    'description': 'Townhalls in a part of Sergipe, brazil.',
    'status': 'active',
    'bbox': JSON.stringify(ADMIN_AREAS_BBOX),
    'created_at': '2017-02-01T12:00:06.000Z',
    'updated_at': '2017-02-01T12:00:06.000Z'
  })
  .then(() => projectFile([
    {
      'id': 2000,
      'name': 'profile_000000',
      'type': 'profile',
      'path': 'project-2000/profile_000000',
      'project_id': 2000,
      'created_at': '2017-02-01T12:00:06.000Z',
      'updated_at': '2017-02-01T12:00:06.000Z'
    },
    {
      'id': 2001,
      'name': 'origins_000000',
      'type': 'origins',
      'path': 'project-2000/origins_000000',
      'project_id': 2000,
      'data': {indicators: [ { key: 'population', label: 'Total population' } ]},
      'created_at': '2017-02-01T12:00:06.000Z',
      'updated_at': '2017-02-01T12:00:06.000Z'
    },
    {
      'id': 2002,
      'name': 'admin-bounds_000000',
      'type': 'admin-bounds',
      'path': 'project-2000/admin-bounds_000000',
      'project_id': 2000,
      'created_at': '2017-02-01T12:00:06.000Z',
      'updated_at': '2017-02-01T12:00:06.000Z'
    }
  ]))
  .then(() => projectAA(getAdminAreasForProject(2000)))
  .then(() => projectOrigins(getOriginsForProject(2000)))
  .then(() => putObjectFromFile(bucket, 'project-2000/profile_000000', FILE_PROFILE))
  .then(() => putObjectFromFile(bucket, 'project-2000/origins_000000', FILE_ORIGINS))
  .then(() => putObjectFromFile(bucket, 'project-2000/admin-bounds_000000', FILE_ADMIN))
  .then(() => projectSourceData([
    {
      'id': 2000,
      'name': 'profile',
      'type': 'file',
      'project_id': 2000
      // 'data':
    },
    {
      'id': 2001,
      'name': 'origins',
      'type': 'file',
      'project_id': 2000
      // 'data':
    },
    {
      'id': 2002,
      'name': 'admin-bounds',
      'type': 'file',
      'project_id': 2000
      // 'data':
    }
  ]))
  .then(() => scenario({
    'id': 2000,
    'name': 'Main scenario for Sergipe',
    'description': '',
    'status': 'active',
    'project_id': 2000,
    'master': true,
    'created_at': '2017-02-01T12:00:06.000Z',
    'updated_at': '2017-02-01T12:00:06.000Z'
  }))
  .then(() => scenarioSettings([
    {
      'scenario_id': 2000,
      'key': 'res_gen_at',
      'value': 0,
      'created_at': '2017-02-01T12:00:01.000Z',
      'updated_at': '2017-02-01T12:00:01.000Z'
    },
    {
      'scenario_id': 2000,
      'key': 'rn_updated_at',
      'value': 0,
      'created_at': '2017-02-01T12:00:01.000Z',
      'updated_at': '2017-02-01T12:00:01.000Z'
    },
    {
      'scenario_id': 2000,
      'key': 'admin_areas',
      'value': JSON.stringify(getSelectedAdminAreas(2000)),
      'created_at': '2017-02-01T12:00:01.000Z',
      'updated_at': '2017-02-01T12:00:01.000Z'
    }
  ]))
  .then(() => scenarioFile([
    {
      'id': 2000,
      'name': 'road-network_000000',
      'type': 'road-network',
      'path': 'scenario-2000/road-network_000000',
      'project_id': 2000,
      'scenario_id': 2000,
      'created_at': '2017-02-01T12:00:06.000Z',
      'updated_at': '2017-02-01T12:00:06.000Z'
    },
    {
      'id': 2001,
      'name': 'poi_000000',
      'type': 'poi',
      'subtype': 'pointOfInterest',
      'path': 'scenario-2000/poi_000000',
      'project_id': 2000,
      'scenario_id': 2000,
      'created_at': '2017-02-01T12:00:06.000Z',
      'updated_at': '2017-02-01T12:00:06.000Z'
    }
  ]))
  .then(() => putObjectFromFile(bucket, 'scenario-2000/road-network_000000', FILE_ROAD_NETWORK))
  .then(() => putObjectFromFile(bucket, 'scenario-2000/poi_000000', FILE_POI))
  .then(() => scenarioSourceData([
    {
      'id': 2000,
      'name': 'road-network',
      'type': 'file',
      'project_id': 2000,
      'scenario_id': 2000
      // 'data':
    },
    {
      'id': 2001,
      'name': 'poi',
      'type': 'file',
      'project_id': 2000,
      'scenario_id': 2000
      // 'data':
    }
  ]));
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
    project1200(),
    project2000()
  ])
  // Reset counters.
  .then(() => db.raw(`
    select setval('operations_id_seq', (SELECT MAX(id) FROM operations));
    select setval('operations_logs_id_seq', (SELECT MAX(id) FROM operations_logs));
    select setval('projects_aa_id_seq', (SELECT MAX(id) FROM projects_aa));
    select setval('projects_files_id_seq', (SELECT MAX(id) FROM projects_files));
    select setval('projects_id_seq', (SELECT MAX(id) FROM projects));
    select setval('projects_origins_id_seq', (SELECT MAX(id) FROM projects_origins));
    select setval('projects_origins_indicators_id_seq', (SELECT MAX(id) FROM projects_origins_indicators));
    select setval('projects_source_data_id_seq', (SELECT MAX(id) FROM projects_source_data));
    select setval('results_id_seq', (SELECT MAX(id) FROM results));
    select setval('results_poi_id_seq', (SELECT MAX(id) FROM results_poi));
    select setval('scenarios_files_id_seq', (SELECT MAX(id) FROM scenarios_files));
    select setval('scenarios_id_seq', (SELECT MAX(id) FROM scenarios));
    select setval('scenarios_source_data_id_seq', (SELECT MAX(id) FROM scenarios_source_data));
  `));
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

function projectAA (data) {
  return db.batchInsert('projects_aa', _.isArray(data) ? data : [data]);
}

function projectOrigins ({ originsIndicators, origins }) {
  return db.batchInsert('projects_origins', origins)
    .then(() => db.batchInsert('projects_origins_indicators', originsIndicators));
}

function projectSourceData (data) {
  return db.batchInsert('projects_source_data', _.isArray(data) ? data : [data]);
}

function scenario (data) {
  return db.batchInsert('scenarios', _.isArray(data) ? data : [data]);
}

function scenarioFile (data) {
  return db.batchInsert('scenarios_files', _.isArray(data) ? data : [data]);
}

function scenarioSettings (data) {
  return db.batchInsert('scenarios_settings', _.isArray(data) ? data : [data]);
}

function scenarioSourceData (data) {
  return db.batchInsert('scenarios_source_data', _.isArray(data) ? data : [data]);
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
  }))
  .then(() => scenarioSettings([
    {
      'scenario_id': id,
      'key': 'res_gen_at',
      'value': 0,
      'created_at': '2017-02-01T12:00:01.000Z',
      'updated_at': '2017-02-01T12:00:01.000Z'
    },
    {
      'scenario_id': id,
      'key': 'rn_updated_at',
      'value': 0,
      'created_at': '2017-02-01T12:00:01.000Z',
      'updated_at': '2017-02-01T12:00:01.000Z'
    }
  ]));
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
  .then(() => putObjectFromFile(bucket, `project-${id}/profile_000000`, FILE_PROFILE))
  .then(() => projectSourceData({
    'id': id,
    'name': 'profile',
    'type': 'file',
    'project_id': id
    // 'data':
  }))
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
  .then(() => scenarioSettings([
    {
      'scenario_id': id,
      'key': 'res_gen_at',
      'value': 0,
      'created_at': '2017-02-01T12:00:01.000Z',
      'updated_at': '2017-02-01T12:00:01.000Z'
    },
    {
      'scenario_id': id,
      'key': 'rn_updated_at',
      'value': 0,
      'created_at': '2017-02-01T12:00:01.000Z',
      'updated_at': '2017-02-01T12:00:01.000Z'
    }
  ]))
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
  .then(() => putObjectFromFile(bucket, `scenario-${id}/poi_000000`, FILE_POI))
  .then(() => scenarioSourceData({
    'id': id,
    'name': 'poi',
    'type': 'file',
    'project_id': id,
    'scenario_id': id
    // 'data':
  }));
}

// Insert a project, a scenario, and all files.
export function projectPendingWithAllFiles (id) {
  return project({
    'id': id,
    'name': `Full project ${id}`,
    'description': 'Project in pending state with one scenario and a profile file',
    'status': 'pending',
    'bbox': JSON.stringify(ADMIN_AREAS_BBOX),
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
      'name': 'origins_000000',
      'type': 'origins',
      'path': `project-${id}/origins_000000`,
      'project_id': id,
      'data': {indicators: [ { key: 'population', label: 'Total population' } ]},
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
  .then(() => putObjectFromFile(bucket, `project-${id}/profile_000000`, FILE_PROFILE))
  .then(() => putObjectFromFile(bucket, `project-${id}/origins_000000`, FILE_ORIGINS))
  .then(() => putObjectFromFile(bucket, `project-${id}/admin-bounds_000000`, FILE_ADMIN))
  .then(() => projectSourceData([
    {
      'id': id,
      'name': 'profile',
      'type': 'file',
      'project_id': id
      // 'data':
    },
    {
      'id': id + 1,
      'name': 'origins',
      'type': 'file',
      'project_id': id
      // 'data':
    },
    {
      'id': id + 2,
      'name': 'admin-bounds',
      'type': 'file',
      'project_id': id
      // 'data':
    }
  ]))
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
  .then(() => scenarioSettings([
    {
      'scenario_id': id,
      'key': 'res_gen_at',
      'value': 0,
      'created_at': '2017-02-01T12:00:01.000Z',
      'updated_at': '2017-02-01T12:00:01.000Z'
    },
    {
      'scenario_id': id,
      'key': 'rn_updated_at',
      'value': 0,
      'created_at': '2017-02-01T12:00:01.000Z',
      'updated_at': '2017-02-01T12:00:01.000Z'
    }
  ]))
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
      'subtype': 'pointOfInterest',
      'path': `scenario-${id}/poi_000000`,
      'project_id': id,
      'scenario_id': id,
      'created_at': '2017-02-01T12:00:06.000Z',
      'updated_at': '2017-02-01T12:00:06.000Z'
    }
  ]))
  .then(() => putObjectFromFile(bucket, `scenario-${id}/road-network_000000`, FILE_ROAD_NETWORK))
  .then(() => putObjectFromFile(bucket, `scenario-${id}/poi_000000`, FILE_POI))
  .then(() => scenarioSourceData([
    {
      'id': id,
      'name': 'road-network',
      'type': 'file',
      'project_id': id,
      'scenario_id': id
      // 'data':
    },
    {
      'id': id + 1,
      'name': 'poi',
      'type': 'file',
      'project_id': id,
      'scenario_id': id
      // 'data':
    }
  ]));
}

export function projectPendingWithAllFilesAndOperation (id) {
  return projectPendingWithAllFiles(id)
    .then(() => addOperationAndLogs('test-operation', id, id));
}

function addOperationAndLogs (name, projectId, scenarioId) {
  let date = new Date();

  const addLog = (opId, code, data) => {
    return db('operations_logs')
      .insert({
        operation_id: opId,
        code,
        data,
        created_at: date
      })
      .then(() => opId);
  };

  return db('operations')
    .returning('id')
    .insert({
      name,
      project_id: projectId,
      scenario_id: scenarioId,
      status: 'complete',
      created_at: date,
      updated_at: date
    })
    .then(res => res[0].id)
    .then(id => addLog(id, 'test', {message: 'Test operation started'}))
    .then(id => addLog(id, 'test:runner', {message: 'Running'}))
    .then(id => addLog(id, 'test', {message: ''}))
    .then(id => addLog(id, 'success', {message: 'Test operation complete'}))
    .then(id => addLog(id, '', {message: ''}));
}
