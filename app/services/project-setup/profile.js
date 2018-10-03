'use strict';
import db from '../../db/';
import {
  putFileStream
} from '../../s3/utils';
import { downloadWbCatalogProjectFile } from '../../utils/wbcatalog';
import { getOSRMProfileDefaultSpeedSettings, renderProfileFile } from '../../utils/osrm-profile';

/**
 * Processes the Profile depending on the source.
 *
 * Profile:
 *  Catalog:
 *    - Download from server
 *  Default:
 *    - Copy default profile
 *  File:
 *    - No action
 *
 * @param {number} projId Project id
 * @param {object} options Additional parameters
 * @param {object} options.logger Output logger
 */
export default async function (projId, {logger}) {
  logger && logger.log('process profile');

  const source = await db('projects_source_data')
    .select('*')
    .where('project_id', projId)
    .where('name', 'profile')
    .first();

  if (source.type === 'wbcatalog') {
    return downloadWbCatalogProjectFile(projId, source, logger);
  }

  if (source.type === 'default') {
    // Generate default profile.
    const fileName = `profile_${Date.now()}`;
    const filePath = `project-${projId}/${fileName}`;

    const defaultSettings = getOSRMProfileDefaultSpeedSettings();

    // Update source data.
    await db('projects_source_data')
      .update({
        data: { settings: defaultSettings }
      })
      .where('id', source.id);

    const profile = renderProfileFile(defaultSettings);
    await putFileStream(filePath, profile);
    return db('projects_files')
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
