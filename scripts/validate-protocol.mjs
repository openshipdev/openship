#!/usr/bin/env node
import { validateSystems } from "../packages/protocol/src/index.js";

import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const REFERENCES = join(ROOT, 'skills', 'openship', 'references')
const SCHEMAS = join(REFERENCES, 'schemas')
const EXAMPLES = join(REFERENCES, 'examples')

const schemaForFixture = (name) => {
  const mappings = [
    ['discovery', 'discovery.schema.json'],
    ['sources-manifest', 'sources-manifest.schema.json'],
    ['sources-bundle', 'sources-bundle.schema.json'],
    ['changes-policy', 'changes-policy.schema.json'],
    ['changes-submission', 'changes-submission.schema.json'],
    ['changes-violation', 'changes-violation.schema.json'],
    ['changes-accepted', 'changes-accepted.schema.json'],
    ['changes-status', 'changes-status.schema.json'],
    ['systems', 'systems.schema.json'],
  ]
  return mappings.find(([prefix]) => name.startsWith(prefix))?.[1]
}

const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const digestPattern = /^sha256:[0-9a-f]{64}$/

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function decodeEntry(entry) {
  if (entry.encoding === 'utf-8') {
    const value = Buffer.from(entry.content, 'utf8')
    assert(value.toString('utf8') === entry.content, 'UTF-8 content does not round-trip')
    return value
  }
  const compact = entry.content.replace(/\s+/g, '')
  const value = Buffer.from(compact, 'base64')
  const canonical = value.toString('base64')
  assert(compact === canonical || compact === canonical.replace(/=+$/, ''), 'base64 is not canonical')
  return value
}

function comparePaths(left, right) {
  return Buffer.compare(Buffer.from(left), Buffer.from(right))
}

function assertSafePath(value, label = 'Path') {
  assert(typeof value === 'string' && value.length > 0, `${label} must be a non-empty string`)
  assert(value === value.normalize('NFC'), `${label} must be NFC`)
  assert(Buffer.byteLength(value, 'utf8') <= 512, `${label} exceeds 512 UTF-8 bytes`)
  assert(!value.startsWith('/') && !value.includes('\\') && !value.includes('\0'), `${label} is not repository-relative`)
  assert(!value.split('/').some((segment) => segment === '' || segment === '.' || segment === '..'), `${label} contains an unsafe segment`)
}

function validateSources(manifest, bundle) {
  const paths = manifest.files.map((file) => file.path)
  for (const file of manifest.files) {
    assertSafePath(file.path, `Manifest path ${JSON.stringify(file.path)}`)
    if (file.type === 'symlink') assertSafePath(file.target, `Symlink target for ${file.path}`)
  }
  assert(new Set(paths).size === paths.length, 'Manifest paths must be unique')
  assert(paths.every((path, index) => index === 0 || comparePaths(paths[index - 1], path) < 0), 'Manifest paths must be sorted by UTF-8 bytes')
  assert(manifest.totals.files === manifest.files.length, 'Manifest file total does not match file entries')
  assert(manifest.totals.bytes === manifest.files.reduce((total, file) => total + file.size, 0), 'Manifest byte total does not match file entries')

  const digestInput = manifest.files.map((file) => `${file.path}\0${file.sha256}\n`).join('')
  assert(manifest.digest === `sha256:${sha256(digestInput)}`, 'Manifest digest does not match file metadata')

  if (!bundle) return
  assert(bundle.digest === manifest.digest, 'Manifest and Bundle digests differ')
  const bundlePaths = Object.keys(bundle.files).sort(comparePaths)
  assert(JSON.stringify(bundlePaths) === JSON.stringify(paths), 'Manifest and Bundle path sets differ')

  for (const file of manifest.files) {
    const entry = bundle.files[file.path]
    assert(entry.encoding === file.encoding, `Encoding differs for ${file.path}`)
    const bytes = decodeEntry(entry)
    assert(bytes.length === file.size, `Size differs for ${file.path}`)
    assert(sha256(bytes) === file.sha256, `SHA-256 differs for ${file.path}`)
  }
}

function crossValidate(name, value, companions) {
  if (name.startsWith('sources-manifest')) validateSources(value, companions.bundle)
  if (name.startsWith('systems')) validateSystems(value)
  if (name.startsWith('changes-accepted') || name.startsWith('changes-status')) {
    assert(digestPattern.test(value.base) && digestPattern.test(value.digest), 'Changes digests are invalid')
  }
}

async function main() {
  const ajv = new Ajv2020({ allErrors: true, strict: true })
  addFormats(ajv)
  const schemaFiles = (await readdir(SCHEMAS)).filter((name) => name.endsWith('.json')).sort()
  const schemas = new Map()
  for (const name of schemaFiles) {
    const schema = JSON.parse(await readFile(join(SCHEMAS, name), 'utf8'))
    schemas.set(name, schema)
    ajv.addSchema(schema)
  }

  const validBundle = JSON.parse(await readFile(join(EXAMPLES, 'valid', 'sources-bundle.json'), 'utf8'))
  let checked = 0
  for (const kind of ['valid', 'invalid']) {
    const files = (await readdir(join(EXAMPLES, kind))).filter((name) => name.endsWith('.json')).sort()
    for (const name of files) {
      const schemaName = schemaForFixture(name)
      assert(schemaName, `No schema mapping for ${name}`)
      const value = JSON.parse(await readFile(join(EXAMPLES, kind, name), 'utf8'))
      const validate = ajv.getSchema(schemas.get(schemaName).$id)
      let error = null
      try {
        assert(validate(value), ajv.errorsText(validate.errors, { separator: '; ' }))
        crossValidate(name, value, { bundle: validBundle })
      } catch (caught) {
        error = caught
      }
      if (kind === 'valid' && error) throw new Error(`${name} should be valid: ${error.message}`)
      if (kind === 'invalid' && !error) throw new Error(`${name} should be invalid`)
      checked += 1
    }
  }
  console.log(`OpenShip protocol validation passed (${schemaFiles.length} schemas, ${checked} fixtures).`)
}

await main()
