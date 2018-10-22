import multiparty from 'multiparty';
import Promise from 'bluebird';

export function parseFormData (req) {
  var form = new multiparty.Form();
  return new Promise((resolve, reject) => {
    form.parse(req, (err, fields, files) => {
      if (err) {
        return reject(err);
      }
      return resolve({ fields, files });
    });
  });
}

// Same as an array map, but nulls and undefined are filtered out.
export function mapValid (arr, iterator) {
  let holder = [];
  arr.forEach((o, i) => {
    let r = iterator(o, i, arr);
    if (r !== null && typeof r !== undefined) {
      holder.push(r);
    }
  });

  return holder;
}

export function getSourceData (db, contentType, id) {
  let sourceDataQ;
  let filesQ;
  let structure;

  switch (contentType) {
    case 'project':
      sourceDataQ = db('projects_source_data')
        .select('*')
        .where('project_id', id);

      filesQ = db('projects_files')
        .select('id', 'name', 'type', 'data', 'path', 'created_at')
        .where('project_id', id);

      structure = {
        profile: {
          type: null,
          files: [],
          wbCatalogOptions: {}
        },
        'admin-bounds': {
          type: null,
          files: [],
          wbCatalogOptions: {}
        },
        origins: {
          type: null,
          files: [],
          wbCatalogOptions: {}
        }
      };
      break;
    case 'scenario':
      sourceDataQ = db('scenarios_source_data')
        .select('*')
        .where('scenario_id', id);

      filesQ = db('scenarios_files')
        .select('id', 'name', 'type', 'subtype', 'path', 'created_at')
        .where('scenario_id', id);

      structure = {
        'road-network': {
          type: null,
          files: [],
          osmOptions: {},
          wbCatalogOptions: {}
        },
        poi: {
          type: null,
          files: [],
          osmOptions: {},
          wbCatalogOptions: {}
        }
      };
      break;
    default:
      throw new Error('Unknown content type: ' + contentType);
  }

  return sourceDataQ
    .then(sources => {
      let filesFetchTypes = [];

      sources.forEach(s => {
        structure[s.name].type = s.type;
        if (s.type === 'osm') {
          // Never going to happen for projects, just scenarios.
          structure[s.name].osmOptions = s.data;
        } else if (s.type === 'file' || s.type === 'default') {
          filesFetchTypes.push(s.name);
        } else if (s.type === 'wbcatalog') {
          filesFetchTypes.push(s.name);
          structure[s.name].wbCatalogOptions = s.data;
        } else if (s.type !== 'default') {
          throw new Error('Unknown source type: ' + s.type);
        }
      });

      if (!filesFetchTypes.length) {
        return structure;
      }

      return filesQ
        .whereIn('type', filesFetchTypes)
        .then(files => {
          files.forEach(f => { structure[f.type].files.push(f); });
          return structure;
        });
    });
}

export function getOperationData (db, opName, id) {
  return db.select('*')
    .from('operations')
    .where('operations.scenario_id', id)
    .where('operations.name', opName)
    .orderBy('created_at', 'desc')
    .first()
    .then(op => {
      if (!op) {
        return null;
      }

      return db.select('*')
        .from('operations_logs')
        .where('operation_id', op.id)
        .orderBy('created_at')
        .then(logs => {
          let errored = false;
          if (logs.length) {
            errored = logs[logs.length - 1].code === 'error';
          }
          return {
            id: op.id,
            status: op.status,
            created_at: op.created_at,
            updated_at: op.updated_at,
            errored,
            logs: logs.map(l => ({
              id: l.id,
              code: l.code,
              data: l.data,
              created_at: l.created_at
            }))
          };
        });
    });
}

export function setScenarioSetting (db, scId, key, value) {
  // Check if setting exists.
  return db('scenarios_settings')
    .select('key')
    .where('scenario_id', scId)
    .where('key', key)
    .first()
    .then(setting => {
      // Update.
      if (setting) {
        return db('scenarios_settings')
          .update({
            value,
            updated_at: (new Date())
          })
          .where('scenario_id', scId)
          .where('key', key);

      // Insert new.
      } else {
        return db('scenarios_settings')
          .insert({
            scenario_id: scId,
            key,
            value,
            created_at: (new Date()),
            updated_at: (new Date())
          });
      }
    });
}

export function getScenarioSetting (db, scId, key) {
  // Check if setting exists.
  return db('scenarios_settings')
    .select('value')
    .where('scenario_id', scId)
    .where('key', key)
    .first()
    .then(setting => {
      if (setting) {
        try {
          // Convert objects, booleans, and integers.
          return JSON.parse(setting.value);
        } catch (e) {
          // Fallback to strings
          return setting.value;
        }
      } else {
        return null;
      }
    });
}

export function getPropInsensitive (object, prop) {
  // prop can be written in caps or any variant.
  // prop, PROP, Prop, PrOp
  // Search for the first match an return it.
  // If not found return prop.
  return Object.keys(object).find(k => k.toLowerCase() === prop) || prop;
}
