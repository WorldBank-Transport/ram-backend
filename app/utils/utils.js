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
          files: []
          // osmOptions
        },
        'admin-bounds': {
          type: null,
          files: []
          // osmOptions
        },
        origins: {
          type: null,
          files: []
          // osmOptions
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
          files: []
          // osmOptions
        },
        poi: {
          type: null,
          files: []
          // osmOptions
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
        if (s.type === 'osm') {
          // Never going to happen for projects, just scenarios.
          structure[s.name].type = 'osm';
          structure[s.name].osmOptions = s.data;
        } else if (s.type === 'file') {
          structure[s.name].type = 'file';
          filesFetchTypes.push(s.name);
        } else {
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
