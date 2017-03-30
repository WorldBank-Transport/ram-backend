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

obj['rra-api']['environment'] = [
  `HYPER_ACCESS=${process.env['HYPER_ACCESS']}`,
  `HYPER_SECRET=${process.env['HYPER_SECRET']}`,
  `DS_ENV=${dsEnv}`
]

// Set container version based on hash. Falls back to latest tag
let hash = process.env.TRAVIS_COMMIT || latest_tag
obj['rra-api']['image'] = `${obj['rra-api']['image']}:${hash}`

// Turn into YAML and replace single quotes with double, because that's what
// ecs-cli wants.
let yamlString = YAML.stringify(obj, 4, 2).replace(/'/g, '"')

// Save to output file
fs.writeFileSync(output, yamlString)
console.info('Generated ECS compatible YAML.')