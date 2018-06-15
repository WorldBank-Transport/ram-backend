'use strict';
import path from 'path';
import fs from 'fs-extra';

import db from '../../db/';
import {
  putFileStream
} from '../../s3/utils';
import { downloadWbCatalogProjectFile } from './common';

export default async function (projId, {logger}) {
  const source = await db('projects_source_data')
    .select('*')
    .where('project_id', projId)
    .where('name', 'profile')
    .first();

  if (source.type === 'wbcatalog') {
    await downloadWbCatalogProjectFile(projId, source, logger);
  }

  if (source.type === 'default') {
    // Copy default profile.
    const fileName = `profile_${Date.now()}`;
    const filePath = `project-${projId}/${fileName}`;

    await putFileStream(filePath, fs.createReadStream(path.resolve(__dirname, '../../utils/default.profile.lua')));
    await db('projects_files')
      .insert({
        name: fileName,
        type: 'profile',
        path: filePath,
        project_id: projId,
        created_at: (new Date()),
        updated_at: (new Date())
      });
  }
}
