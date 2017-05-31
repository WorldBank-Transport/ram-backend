'use strict'

const input = 'ecs-task-definition.yml'
const output = 'ecs-task-definition-generated.yml'

console.info('Generating ECS compatible YAML.')

let YAML = require('yamljs')
let fs = require('fs')

let obj = YAML.load(input)

// Switch based on environment
if (process.env.TRAVIS_BRANCH === process.env.STABLE_BRANCH) {
  var latest_tag = 'latest-stable'
  var dsEnv = 'production'
} else {
  latest_tag = 'latest-dev'
  dsEnv = 'staging'
}

var splitEnvs = [
  'ANL_SERVICE',
  'ANL_CONTAINER',
  'ANL_DB',
  'ANL_STORAGE_HOST',
  'ANL_STORAGE_PORT',
  'HYPER_ACCESS',
  'HYPER_SECRET',
  'HYPER_SIZE'
];

var envs = splitEnvs
  .filter(o => process.env[o])
  .map(e => `${e}=${process.env[e]}`);

envs.push(`DS_ENV=${dsEnv}`)

obj['rra-api']['environment'] = envs

// Set container version based on hash. Falls back to latest tag
let hash = process.env.TRAVIS_COMMIT || latest_tag
obj['rra-api']['image'] = `${obj['rra-api']['image']}:${hash}`

// Turn into YAML and replace single quotes with double, because that's what
// ecs-cli wants.
let yamlString = YAML.stringify(obj, 4, 2).replace(/'/g, '"')

// Save to output file
fs.writeFileSync(output, yamlString)
console.info('Generated ECS compatible YAML.')