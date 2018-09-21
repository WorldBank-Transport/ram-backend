'use strict';
import Joi from 'joi';
import Boom from 'boom';
import Promise from 'bluebird';
import Octokit from '@octokit/rest';
import { safeDump } from 'js-yaml';
import Zip from 'node-zip';
import _ from 'lodash';

import config from '../config';
import db from '../db/';
import { ProjectNotFoundError, DataConflictError, DisabledServiceError, getBoomResponseForError } from '../utils/errors';
import { getFileContents } from '../s3/utils';
import { getFauxPoiFeature } from './scenarios--poi';

const rahExport = config.rahExport;

module.exports = [
  {
    path: '/projects/{projId}/rah-export',
    method: 'POST',
    config: {
      validate: {
        params: {
          projId: Joi.number()
        },
        payload: {
          title: Joi.string().required(),
          country: Joi.string().required(),
          date: Joi.date().required(),
          description: Joi.string().required(),
          authors: Joi.array().items(
            Joi.object().keys({
              id: Joi.string(),
              name: Joi.string().required()
            })
          ).required(),
          topics: Joi.array().items(
            Joi.object().keys({
              id: Joi.string(),
              name: Joi.string().required()
            })
          ).required(),
          includeResults: Joi.bool().required(),
          contactName: Joi.string().required(),
          contactEmail: Joi.string().email().required()
        }
      }
    },
    handler: async (request, reply) => {
      // Check config.
      if (config.environment === 'offline') {
        throw new DisabledServiceError('RAH export is disabled for offline instances');
      }
      const projId = request.params.projId;
      const instId = config.instanceId;
      const pieces = (rahExport.ghRepo || '').split('/');
      const ghOwner = pieces[0];
      const ghRepo = pieces[1];
      const ghPath = rahExport.ghPath;
      const ghToken = rahExport.ghToken;
      const includeResults = request.payload.includeResults;
      if (!rahExport || !ghOwner || !ghRepo || !ghPath || !ghToken) {
        throw new DisabledServiceError('RAH export not setup');
      }

      try {
        const project = await db('projects')
          .select('*')
          .where('id', projId)
          .first();

        if (!project) {
          throw new ProjectNotFoundError();
        }
        //  It's not possible export pending projects.
        if (project.status === 'pending') {
          throw new DataConflictError('Project setup not completed');
        }

        const files = await db('scenarios_files')
          .select('*')
          .where('project_id', projId)
          .whereIn('type', ['results-csv', 'results-geojson']);

        if (includeResults && !files.length) {
          throw new DataConflictError('There are no scenarios with results');
        }

        // Get the master scenario id. This is used as the base scenario.
        const masterScenarioId = await db('scenarios')
          .where('project_id', projId)
          .where('master', true)
          .first('id')
          .then(r => r.id);

        // Unique scenario ids.
        const scIdsWithResults = files.reduce((acc, o) => (
          acc.indexOf(o.scenario_id) === -1
            ? acc.concat(o.scenario_id)
            : acc
        ), []);

        // Get:
        // Population indicators for the filter bar.
        // Poi types for the filter bar.
        // Scenarios with results for the result selection.
        const [popIndicators, poiTypes, scenarios] = await Promise.all([
          getPopulationIndicators(projId),
          getPoiTypesOptions(projId, masterScenarioId),
          db('scenarios')
            .select('id', 'name')
            .whereIn('id', scIdsWithResults)
        ]);

        // Get the POI faux features.
        const poiFauxFeatures = await Promise.map(poiTypes, async (type) => {
          const fauxFeature = await getFauxPoiFeature(projId, masterScenarioId, type.key);
          return {
            key: `poi-${type.key}.json`,
            data: fauxFeature
          };
        }, {concurrency: 3});

        // Build the poi and pop key index to use on the results mapping.
        // Eg. {'Townhalls': 'e0'}
        const poiKIndex = poiTypes.reduce((acc, o) => ({
          ...acc, [o.key]: o.prop
        }), {});
        // Eg. {'pop-m': 'p0'}
        const popKIndex = popIndicators.reduce((acc, o) => ({
          ...acc, [o.key]: o.prop
        }), {});

        // For each one of the scenarios get the results with the population
        // and the poi values. The result is compressed to save bandwidth.
        // On the client it must be rehydrated and mapped to the correct
        // poi and pop keys using the `prop` attribute.
        const scenariosFauxFeatures = await Promise.map(scIdsWithResults, async (scId) => {
          // Get the scenario results.
          const scenarioResults = await db('results')
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
            .whereIn('results.scenario_id', scId).then(ids => _.uniq(ids));

          // Each feature will look something like:
          // {
          //   "i": 2000021,
          //   "n": "Tobias Barreto",
          //   "c": [
          //       -38.00345,
          //       -11.18803
          //   ],
          //   "p0": 69500,
          //   "p1": 35418,
          //   "p2": 34082
          //   "e1": 4448,
          //   "e0": 16,
          // }
          const fauxFeature = scenarioResults.reduce((acc, result) => {
            const id = result.origin_id;
            const popK = popKIndex[result.pop_key];
            const poiK = poiKIndex[result.poi_type];
            let object = {
              [popK]: result.pop_value,
              [poiK]: result.time_to_poi
            };
            if (!acc[id]) {
              object = {
                ...object,
                'i': id,
                'n': result.origin_name,
                'c': [parseInt(result.origin_coords[0] * 100000) / 100000, parseInt(result.origin_coords[1] * 100000) / 100000]
              };
            }
            return {
              ...acc,
              [id]: {
                ...acc[id],
                ...object
              }
            };
          }, {});

          return {
            key: `results-sc-${scId}.json`,
            data: Object.values(fauxFeature)
          };
        }, {concurrency: 3});

        // Meta object
        const scenarioMetaInformation = {
          bbox: project.bbox,
          poiTypes,
          popIndicators,
          scenarios
          // scenariosFauxFeatures, // <-------------- Not meta
          // poiFauxFeatures // <-------------- Not meta
        };

        // Build the markdown file.
        const frontmatter = {
          title: request.payload.title,
          country: request.payload.country,
          date: request.payload.date,
          authors: request.payload.authors.map(a => a.name),
          topics: request.payload.topics.map(t => t.name),
          include_results: includeResults,
          contact_name: request.payload.contactName,
          contact_email: request.payload.contactEmail
        };

        const indexMd = `---
${safeDump(frontmatter)}
---

${request.payload.description}
        `;

        const gClient = new GHClient(ghOwner, ghRepo, ghToken);

        // Project folder on the GH repo.
        const projectGHFolder = `${ghPath}/project-${instId}-${project.id}`;

        // Add all the files.
        // Readme.
        gClient.addFile(`${projectGHFolder}/index.md`, indexMd);

        // Results meta file.
        gClient.addFile(`${projectGHFolder}/index.json`, JSON.stringify(scenarioMetaInformation));

        // Faux features. (poi and results).
        [scenariosFauxFeatures, poiFauxFeatures].forEach(featureFiles => {
          featureFiles.forEach(fileData => {
            gClient.addFile(`${projectGHFolder}/${fileData.key}`, JSON.stringify(fileData.data));
          });
        });

        // Data files.
        if (files.length) {
          const zip = new Zip();
          await Promise.map(files, async f => {
            const ext = f.type === 'results-csv' ? 'csv' : 'geojson';
            zip.file(`${f.name}.${ext}`, await getFileContents(f.path));
          });
          const zipFile = zip.generate({ base64: true, compression: 'DEFLATE' });
          gClient.addBinaryFile(`${projectGHFolder}/results.zip`, zipFile);
        }

        // Create branch.
        const branchName = `ram-export/${instId}-${project.id}`;
        try {
          await gClient.createBranch('master', branchName);
        } catch (error) {
          const message = JSON.parse(error.message).message;
          if (message === 'Reference already exists') {
            return reply(Boom.conflict(new DataConflictError('This project was already exported and awaits processing')));
          } else {
            throw error;
          }
        }

        let committer;
        if (rahExport.committerName && rahExport.committerEmail) {
          committer = { name: rahExport.committerName, email: rahExport.committerEmail };
        }
        let author;
        if (rahExport.authorName && rahExport.authorEmail) {
          author = { name: rahExport.authorName, email: rahExport.authorEmail };
        }
        // Commit and PR.
        await gClient.commit(`RAM automated export of project ${project.id} (${instId})`, committer, author);
        // Include mention to moderators to send out notifications.
        const pullReq = await gClient.openPR(`RAM automated export of project ${project.name} from ${instId}`, 'cc @WorldBank-Transport/rah-moderators');
        return reply({statusCode: 200, message: 'Project exported. Approval pending.', prUrl: pullReq.data.url});
      } catch (error) {
        return reply(getBoomResponseForError(error));
      }
    }
  }
];

class GHClient {
  constructor (owner, repo, authToken) {
    this.octokit = Octokit();
    this.octokit.authenticate({
      type: 'token',
      token: authToken
    });

    // Process:
    // - Get the base branch SHA to create a new branch from it.
    // - Create a file tree which uses the tree of the new branch (its SHA)
    //   as a base.
    // - Create blobs for the binary files and add their sha to the tree.
    // - Create a commit which points to the creates tree and has the base
    //   branch as a parent.
    // - Update the new branch to point to that commit.

    this.owner = owner;
    this.repo = repo;

    this.branch = null;
    this.fileTree = [];
    this.fileBinaries = [];
  }

  async createBranch (base, dest) {
    const {owner, repo} = this;
    const baseBranch = await this.octokit.gitdata.getReference({owner, repo, ref: `heads/${base}`});
    const newBranch = await this.octokit.gitdata.createReference({owner, repo, ref: `refs/heads/${dest}`, sha: baseBranch.data.object.sha});
    this.branch = {
      name: dest,
      sha: newBranch.data.object.sha,
      srcName: base,
      srcSha: baseBranch.data.object.sha
    };
  }

  addFile (path, content) {
    this.fileTree.push({
      mode: '100644',
      type: 'blob',
      path,
      content
    });
  }

  addBinaryFile (path, content) {
    this.fileBinaries.push({
      path,
      content
    });
  }

  async commit (message, committer, author) {
    const {owner, repo, branch, fileTree} = this;
    // Create the binaries.
    for (const { content, path } of this.fileBinaries) {
      const blobResult = await this.octokit.gitdata.createBlob({owner, repo, content, encoding: 'base64'});
      this.fileTree.push({
        mode: '100644',
        type: 'blob',
        path,
        sha: blobResult.data.sha
      });
    }
    const treeResult = await this.octokit.gitdata.createTree({owner, repo, tree: fileTree, base_tree: branch.sha});
    const commit = await this.octokit.gitdata.createCommit({owner, repo, message, tree: treeResult.data.sha, parents: [branch.sha], committer, author});
    return this.octokit.gitdata.updateReference({owner, repo, ref: `heads/${branch.name}`, sha: commit.data.sha});
  }

  async openPR (title, body) {
    const {owner, repo, branch} = this;
    return this.octokit.pullRequests.create({owner, repo, title, head: branch.name, base: branch.srcName, body});
  }
}

async function getPopulationIndicators (projId) {
  const originsFiles = await db('projects_files')
    .select('data')
    .where('project_id', projId)
    .where('type', 'origins')
    .first();

  // Add minified property keys for the results features.
  return originsFiles.data.indicators.map((o, i) => Object.assign({}, o, {
    prop: `p${i}`
  }));
}

async function getPoiTypesOptions (projId, scId) {
  const sourceData = await db('scenarios_source_data')
    .select('type', 'data')
    .where('project_id', projId)
    .where('scenario_id', scId)
    .where('name', 'poi')
    .first();

  let poiTypes = [];
  if (sourceData.type === 'osm') {
    const osmTypesIndex = {
      health: 'Health facilities',
      education: 'Education facilities',
      financial: 'Financial institutions'
    };
    poiTypes = sourceData.data.osmPoiTypes.map(o => ({
      key: o,
      label: osmTypesIndex[o]
    }));
  } else if (sourceData.type === 'file' || sourceData.type === 'wbcatalog') {
    const poiFiles = await db('scenarios_files')
      .select('subtype')
      .where('scenario_id', scId)
      .where('type', 'poi');
    poiTypes = poiFiles.map(o => ({key: o.subtype, label: o.subtype}));
  } else {
    throw new Error(`Invalid source for poi: ${sourceData.type}`);
  }

  // Add minified property keys for the results features.
  return poiTypes.map((o, i) => Object.assign({}, o, {
    prop: `e${i}`
  }));
}
