'use strict';
import Joi from 'joi';
import Boom from 'boom';
import Octokit from '@octokit/rest';

import db from '../db/';
import { ProjectNotFoundError, DataConflictError } from '../utils/errors';

const OWNER = 'danielfdsilva';
const REPO = 'the-rah';
const AUTH_TOKEN = '--redacted--';

module.exports = [
  {
    path: '/rahhh',
    method: 'GET',
    handler: async (request, reply) => {
      const gClient = new GHClient(OWNER, REPO, AUTH_TOKEN);
      const projectId = Date.now();
      const branchName = `ram-export/${projectId}`;

      await gClient.createBranch('master', branchName);

      gClient.addFile(`data/project-${projectId}/data.md`, `
# Project ${projectId}
Some info about this
`);

      gClient.addFile(`data/project-${projectId}/results.geojson`, `
{
  "type": "FeatureCollection",
  "features": [
    { "type": "Feature", "geometry": { "type": "Point", "coordinates": [29.88, -3.51] } },
    { "type": "Feature", "geometry": { "type": "Point", "coordinates": [51.67, 40.17] } },
    { "type": "Feature", "geometry": { "type": "Point", "coordinates": [-109.33, 42.55] } }
  ]
}
`);

      await gClient.commit(`RAM automated export of project ${projectId}`);
      const pullReq = await gClient.openPR(`RAM automated export of project ${projectId}`);
      reply({statusCode: 200, message: 'Project exported. Approval pending.', prUrl: pullReq.data.url});
    }
  },
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
          contactName: Joi.string().required(),
          contactEmail: Joi.string().email().required()
        }
      }
    },
    handler: (request, reply) => {
      return db('projects')
        .select('status')
        .where('id', request.params.projId)
        .then(projects => {
          if (!projects.length) throw new ProjectNotFoundError();
          //  It's not possible export pending projects.
          if (projects[0].status === 'pending') throw new DataConflictError('Project setup not completed');
        })
        .then(() => {
          reply({ok: 'ok'});
        })
        .catch(ProjectNotFoundError, e => reply(Boom.notFound(e.message)))
        .catch(DataConflictError, e => reply(Boom.conflict(e.message)))
        .catch(err => {
          console.log('err', err);
          reply(Boom.badImplementation(err));
        });
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
    // - Create a commit which points to the creates tree and has the base
    //   branch as a parent.
    // - Update the new branch to point to that commit.

    this.owner = owner;
    this.repo = repo;

    this.branch = null;
    this.fileTree = [];
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

  async commit (message, committer, author) {
    const {owner, repo, branch, fileTree} = this;
    const treeResult = await this.octokit.gitdata.createTree({owner, repo, tree: fileTree, base_tree: branch.sha});
    const commit = await this.octokit.gitdata.createCommit({owner, repo, message, tree: treeResult.data.sha, parents: [branch.sha], committer, author});
    return this.octokit.gitdata.updateReference({owner, repo, ref: `heads/${branch.name}`, sha: commit.data.sha});
  }

  async openPR (title, body) {
    const {owner, repo, branch} = this;
    return this.octokit.pullRequests.create({owner, repo, title, head: branch.name, base: branch.srcName, body});
  }
}
