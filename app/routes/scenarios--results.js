'use strict';
import Joi from 'joi';
import Promise from 'bluebird';
import Zip from 'node-zip';
import _ from 'lodash';

import db from '../db/';
import { getFileContents } from '../s3/utils';
import { FileNotFoundError, DataValidationError, getBoomResponseForError } from '../utils/errors';

export default [
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
          download: Joi.boolean().truthy('true').falsy('false').valid('true').required(),
          type: Joi.string().valid(['csv', 'geojson']).required()
        }
      }
    },
    handler: async (request, reply) => {
      const { projId, scId } = request.params;
      const { type } = request.query;

      try {
        const files = await db('scenarios_files')
          .select('*')
          .where('project_id', projId)
          .where('scenario_id', scId)
          .where('type', `results-${type}`);

        if (!files.length) throw new FileNotFoundError('Results not found');

        // Zip the files.
        const zip = new Zip();
        await Promise.mapSeries(files, async f => {
          const content = await getFileContents(f.path);
          zip.file(`${f.name}.${type}`, content);
        });

        const zipFile = zip.generate({ base64: false, compression: 'DEFLATE' });

        return reply(zipFile)
          .type('application/zip')
          .encoding('binary')
          .header('Content-Disposition', `attachment; filename=results-${type}-p${projId}s${scId}.zip`);
      } catch (error) {
        return reply(getBoomResponseForError(error));
      }
    }
  },
  {
    path: '/projects/{projId}/scenarios/{scId}/results/analysis',
    method: 'GET',
    config: {
      validate: {
        params: {
          projId: Joi.number(),
          scId: Joi.number()
        },
        query: {
          poiType: Joi.string().required(),
          popInd: Joi.string().required()
        }
      }
    },
    handler: async (request, reply) => {
      const { projId, scId } = request.params;
      const { poiType, popInd } = request.query;

      // Prepare response.
      // The response is returned with the amount of the population that have
      // access to a given POI in a given time.
      // The amount of people in the 1st position of the pop array are within
      // (1st postition of analysisMins) minutes of the poi.
      // To know the percentage is just a matter of dividing this number by
      // the total population.
      // The response is returned in this way instead of precomputed because
      // calculation the totals when comparing scenarios would show a
      // a skewed result. In this way the value is computed client side with
      // only the comparing admin areas being taken into account.
      // let r = {
      //   accessibilityTime: {
      //     poi: 'bank',
      //     analysisMins: [10, 20, 30, 40, 50],
      //     adminAreas: [
      //       {
      //         id: 00000,
      //         name: 'something',
      //         totalPop: 15000,
      //         pop: [0, 0, 9000, 10000, 14000]
      //       }
      //     ]
      //   }
      // };
      let accessibilityTime = {
        poi: poiType,
        indicator: popInd,
        analysisMins: [10, 20, 30, 60, 90, 120]
      };

      // Sum by pop_value.
      const sumPop = (arr) => arr.reduce((acc, o) => acc + (parseInt(o.pop_value) || 1), 0);
      // Check if given time is less that given nimutes accounting for nulls.
      const isLessThanMinutes = (time, min) => time === null ? false : time <= min * 60;

      try {
        await checkPoi(projId, scId, poiType);
        await checkPopInd(projId, popInd);

        // Get all the admin areas for which results were generated.
        const aa = await db('scenarios_settings')
          .select('value')
          .where('key', 'admin_areas')
          .where('scenario_id', scId)
          .first();
        const selectedAA = await db('projects_aa')
          .select('id', 'name')
          .where('project_id', projId)
          .whereIn('id', JSON.parse(aa.value));

        accessibilityTime.adminAreas = selectedAA.map(a => {
          return { id: a.id, name: a.name };
        });

        const results = await db.raw(`
          SELECT
            pop.value as pop_value,
            pop.key as pop_key,
            r.project_aa_id as aa_id,
            rp.type as poi_type,
            rp.time as time_to_poi,
            po.id as origin_id
          FROM results r
          INNER JOIN results_poi rp ON r.id = rp.result_id
          INNER JOIN projects_origins po ON po.id = r.origin_id
          INNER JOIN projects_origins_indicators pop ON po.id = pop.origin_id
          WHERE pop.key = :popInd and rp.type = :poiType and r.project_id = :projId and r.scenario_id = :scId
        `, { popInd, poiType, projId, scId })
        .then(res => res.rows);

        // Accessibility times groupped by admin area.
        accessibilityTime.adminAreas = _(accessibilityTime.adminAreas).map(aa => {
          const filtered = results.filter(r => r.aa_id === aa.id);

          if (filtered.length) {
            aa.totalPop = sumPop(filtered);
            aa.pop = accessibilityTime.analysisMins.map(time => sumPop(filtered.filter(o => isLessThanMinutes(o.time_to_poi, time))));
          } else {
            aa.pop = [];
            aa.totalPop = null;
          }

          return aa;
        })
        .sortBy(accessibilityTime.adminAreas, o => _.deburr(o.name))
        .reverse()
        .value();

        return reply({accessibilityTime});
      } catch (error) {
        return reply(getBoomResponseForError(error));
      }
    }
  },
  {
    path: '/projects/{projId}/scenarios/{scId}/results/raw',
    method: 'GET',
    config: {
      validate: {
        params: {
          projId: Joi.number(),
          scId: Joi.number()
        },
        query: {
          origin_name: Joi.string(),
          poiType: Joi.string().required(),
          popInd: Joi.string().required(),
          sortBy: Joi.string(),
          sortDir: Joi.string().valid(['asc', 'desc']),
          limit: Joi.number().default(50),
          page: Joi.number()
        }
      }
    },
    handler: async (request, reply) => {
      const { projId, scId } = request.params;
      const { page, limit } = request;
      const offset = (page - 1) * limit;
      const { poiType, popInd, origin_name: originName } = request.query;
      let { sortBy, sortDir } = request.query;

      sortBy = sortBy || 'origin_name';
      sortDir = sortDir || 'asc';

      try {
        const _count = db('results')
          .count('projects_origins.id')
          .innerJoin('results_poi', 'results.id', 'results_poi.result_id')
          .innerJoin('projects_origins', 'projects_origins.id', 'results.origin_id')
          .innerJoin('projects_origins_indicators', 'projects_origins_indicators.origin_id', 'projects_origins.id')
          .innerJoin('projects_aa', 'projects_aa.id', 'results.project_aa_id')
          .where('results.project_id', projId)
          .where('results.scenario_id', scId)
          .where('projects_origins_indicators.key', popInd)
          .where('results_poi.type', poiType)
          .modify(function (queryBuilder) {
            if (originName) {
              queryBuilder.whereRaw(`LOWER(UNACCENT(projects_origins.name)) like LOWER(UNACCENT('%${originName}%'))`);
            }
          })
          .first();

        const _results = db('results')
          .select(
            'projects_origins.id as origin_id',
            'projects_origins.name as origin_name',
            'results.project_aa_id as aa_id',
            'projects_aa.name as aa_name',
            'projects_origins_indicators.value as pop_value',
            'projects_origins_indicators.key as pop_key',
            'results_poi.type as poi_type',
            'results_poi.time as time_to_poi'
          )
          .innerJoin('results_poi', 'results.id', 'results_poi.result_id')
          .innerJoin('projects_origins', 'projects_origins.id', 'results.origin_id')
          .innerJoin('projects_origins_indicators', 'projects_origins_indicators.origin_id', 'projects_origins.id')
          .innerJoin('projects_aa', 'projects_aa.id', 'results.project_aa_id')
          .where('results.project_id', projId)
          .where('results.scenario_id', scId)
          .where('projects_origins_indicators.key', popInd)
          .where('results_poi.type', poiType)
          .modify(function (queryBuilder) {
            if (originName) {
              queryBuilder.whereRaw(`LOWER(UNACCENT(projects_origins.name)) like LOWER(UNACCENT('%${originName}%'))`);
            }
          })
          .orderBy(sortBy, sortDir)
          .offset(offset).limit(limit);

        await Promise.all([
          checkPoi(projId, scId, poiType),
          checkPopInd(projId, popInd)
        ]);

        const [{count}, results] = await Promise.all([_count, _results]);

        request.count = parseInt(count);
        return reply(results);
      } catch (error) {
        return reply(getBoomResponseForError(error));
      }
    }
  },
  {
    path: '/projects/{projId}/scenarios/{scId}/results/geo',
    method: 'GET',
    config: {
      validate: {
        params: {
          projId: Joi.number(),
          scId: Joi.number()
        },
        query: {
          poiType: Joi.string().required(),
          popInd: Joi.string().required()
        }
      }
    },
    handler: async (request, reply) => {
      const { projId, scId } = request.params;
      const { poiType, popInd } = request.query;

      try {
        await Promise.all([
          checkPoi(projId, scId, poiType),
          checkPopInd(projId, popInd)
        ]);

        const results = await db('results')
          .select(
            'projects_origins.id as origin_id',
            'projects_origins.name as origin_name',
            'projects_origins.coordinates as origin_coords',
            'projects_origins_indicators.value as pop_value',
            'projects_origins_indicators.key as pop_key',
            'results_poi.type as poi_type',
            'results_poi.time as time_to_poi'
          )
          .innerJoin('results_poi', 'results.id', 'results_poi.result_id')
          .innerJoin('projects_origins', 'projects_origins.id', 'results.origin_id')
          .innerJoin('projects_origins_indicators', 'projects_origins_indicators.origin_id', 'projects_origins.id')
          .where('results.project_id', projId)
          .where('results.scenario_id', scId)
          .where('projects_origins_indicators.key', popInd)
          .where('results_poi.type', poiType);

        return reply(prepGeoResponse(results));
      } catch (error) {
        return reply(getBoomResponseForError(error));
      }
    }
  }
];

async function checkPoi (projId, scId, poiType) {
  const poiTypes = await db('results')
    .distinct('results_poi.type')
    .select()
    .innerJoin('results_poi', 'results_poi.result_id', 'results.id')
    .where('project_id', projId)
    .where('scenario_id', scId)
    .then(poiTypes => _.map(poiTypes, 'type'));

  if (!poiTypes.length) throw new DataValidationError(`There are no available poi types to use`);
  if (poiTypes.indexOf(poiType) === -1) throw new DataValidationError(`"poiType" must be one of [${poiTypes.join(', ')}]`);

  return poiTypes;
}

async function checkPopInd (projId, popInd) {
  const popInds = await db('projects_files')
    .select('data')
    .where('project_id', projId)
    .where('type', 'origins')
    .first()
    .then(popInds => _.map(popInds.data.indicators, 'key'));

  if (!popInds.length) throw new DataValidationError(`There are no available population indicators to use`);
  if (popInds.indexOf(popInd) === -1) throw new DataValidationError(`"popInd" must be one of [${popInds.join(', ')}]`);

  return popInds;
}

function prepGeoResponse (results) {
  let maxPop = Math.max.apply(Math, results.map(o => o.pop_value));

  return results.map(o => {
    return {
      'i': o.origin_id,
      'n': o.origin_name,
      'e': o.time_to_poi,
      'p': o.pop_value,
      'pn': parseInt(o.pop_value / maxPop * 100) / 100,
      'c': [parseInt(o.origin_coords[0] * 100000) / 100000, parseInt(o.origin_coords[1] * 100000) / 100000]
    };
  });
}
