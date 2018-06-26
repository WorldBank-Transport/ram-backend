'use strict';
import Joi from 'joi';
import Boom from 'boom';
import Promise from 'bluebird';
import _ from 'lodash';
import Octokit from '@octokit/rest';

import config from '../config';
import db from '../db/';
import { ProjectNotFoundError, DataConflictError } from '../utils/errors';
import { getFileContents } from '../s3/utils';

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
          contactName: Joi.string().required(),
          contactEmail: Joi.string().email().required()
        }
      }
    },
    handler: async (request, reply) => {
      // Check config.
      const pieces = _.get(rahExport, 'ghRepo', '').split('/');
      const ghOwner = pieces[0];
      const ghRepo = pieces[1];
      const ghPath = _.get(rahExport, 'ghPath', '');
      const ghToken = _.get(rahExport, 'ghToken', '');
      if (!rahExport || !ghOwner || !ghRepo || !ghPath || !ghToken) {
        return reply(Boom.serverUnavailable('RAH export not setup'));
      }

      try {
        const project = await db('projects')
          .select('*')
          .where('id', request.params.projId)
          .first();

        if (!project) {
          return reply(Boom.notFound(new ProjectNotFoundError()));
        }
        //  It's not possible export pending projects.
        if (project.status === 'pending') {
          return reply(Boom.conflict(new DataConflictError('Project setup not completed')));
        }

        const files = await db('scenarios_files')
          .select('*')
          .where('project_id', request.params.projId)
          .whereIn('type', ['results-csv', 'results-geojson']);

        if (!files.length) {
          return reply(Boom.conflict(new DataConflictError('There are no scenarios with results')));
        }

        const gClient = new GHClient(ghOwner, ghRepo, ghToken);

        // Add all the files.
        // Readme.
        gClient.addFile(`${ghPath}/project-${project.id}/readme.md`, `# Project ${project.name}\n${project.description}`);
        // Data files.
        await Promise.map(files, async f => {
          const ext = f.type === 'results-csv' ? 'csv' : 'geojson';
          gClient.addFile(`data/project-${project.id}/${f.name}.${ext}`, await getFileContents(f.path));
        });

        // Create branch.
        const branchName = `ram-export/${project.id}`;
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
        await gClient.commit(`RAM automated export of project ${project.id}`, committer, author);
        const pullReq = await gClient.openPR(`RAM automated export of project ${project.id}`);
        return reply({statusCode: 200, message: 'Project exported. Approval pending.', prUrl: pullReq.data.url});
      } catch (err) {
        console.log('err', err);
        reply(Boom.badImplementation(err));
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
