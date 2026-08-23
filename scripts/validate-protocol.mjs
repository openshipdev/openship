#!/usr/bin/env node

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

function assertAcyclic(ids, pairs, label) {
  const outgoing = new Map(ids.map((id) => [id, []]))
  const indegree = new Map(ids.map((id) => [id, 0]))
  for (const [from, to] of pairs) {
    if (!outgoing.has(from) || !outgoing.has(to)) continue
    outgoing.get(from).push(to)
    indegree.set(to, indegree.get(to) + 1)
  }
  const queue = [...ids].filter((id) => indegree.get(id) === 0)
  let seen = 0
  while (queue.length) {
    const current = queue.shift()
    seen += 1
    for (const next of outgoing.get(current)) {
      indegree.set(next, indegree.get(next) - 1)
      if (indegree.get(next) === 0) queue.push(next)
    }
  }
  assert(seen === ids.length, `${label} must be acyclic`)
}

function matchesSelector(selector, path) {
  if (selector.endsWith('/**')) {
    const prefix = selector.slice(0, -3)
    return path === prefix || path.startsWith(`${prefix}/`)
  }
  return path === selector
}

function validateSystems(payload) {
  const { manifest, bundle } = payload.source
  validateSources(manifest, bundle)

  const { system } = payload
  const nodeById = new Map(system.nodes.map((node) => [node.id, node]))
  assert(nodeById.size === system.nodes.length, 'Node IDs must be unique')
  const roots = system.nodes.filter((node) => node.kind === 'Root')
  assert(roots.length === 1, 'Systems requires exactly one Root')
  assert(roots[0].id === system.rootNodeId, 'rootNodeId must reference the Root')
  assert(roots[0].parentId === undefined, 'Root must not have a parent')

  for (const node of system.nodes) {
    assert(node.metadata && (node.metadata.ownership === 'first_party' || node.metadata.ownership === 'third_party'), `Node ${node.id} must declare metadata.ownership as first_party or third_party`)
    const parent = node.parentId ? nodeById.get(node.parentId) : undefined
    if (node.kind === 'Host') assert(parent?.kind === 'Root', `Host ${node.id} must have the Root parent`)
    if (node.kind === 'Container') assert(parent?.kind === 'Host', `Container ${node.id} must have a Host parent`)
    if (node.kind === 'Process') assert(parent?.kind === 'Host' || parent?.kind === 'Container', `Process ${node.id} must have a Host or Container parent`)
    if (node.kind === 'Library') assert(node.parentId === undefined, `Library ${node.id} must not have a parent`)
    for (const selector of node.sourceSelectors ?? []) {
      assert(manifest.files.some((file) => matchesSelector(selector, file.path)), `Source selector ${selector} on ${node.id} does not resolve`)
    }
  }
  assertAcyclic(system.nodes.map((node) => node.id), system.nodes.filter((node) => node.parentId).map((node) => [node.parentId, node.id]), 'Containment graph')

  assert(new Set(system.edges.map((edge) => edge.id)).size === system.edges.length, 'Edge IDs must be unique')
  for (const edge of system.edges) {
    const from = nodeById.get(edge.fromNodeId)
    const to = nodeById.get(edge.toNodeId)
    assert(from && to, `Edge ${edge.id} references a missing node`)
    assert(from.kind === 'Process', `Edge ${edge.id} must start at a Process`)
    if (edge.type === 'Dependency') assert(to.kind === 'Library', `Dependency ${edge.id} must target a Library`)
    else assert(to.kind === 'Process' || to.kind === 'Container', `${edge.type} ${edge.id} must target a Process or Container`)
  }
  const graphIds = system.nodes.map((node) => node.id)
  assertAcyclic(graphIds, system.edges.filter((edge) => edge.type === 'Dataflow').map((edge) => [edge.fromNodeId, edge.toNodeId]), 'Dataflow graph')
  assertAcyclic(graphIds, system.edges.filter((edge) => edge.type === 'Dependency').map((edge) => [edge.fromNodeId, edge.toNodeId]), 'Dependency graph')

  const context = system.context
  if (!context) return
  const concerns = new Set(context.concerns ?? [])
  const documents = new Map()
  for (const document of context.documents ?? []) {
    assert(document.hash === `sha256:${sha256(`${document.kind}\n${document.title}\n${document.language}\n${document.text}`)}`, `Document hash mismatch for ${document.title}`)
    assert(!documents.has(document.hash), `Duplicate document ${document.hash}`)
    documents.set(document.hash, document)
  }

  const supersedes = [...documents.values()].filter((document) => document.supersedes && documents.has(document.supersedes)).map((document) => [document.hash, document.supersedes])
  assertAcyclic([...documents.keys()], supersedes, 'Document supersession graph')

  for (const cell of context.matrix ?? []) {
    assert(nodeById.has(cell.nodeId), `Matrix references missing node ${cell.nodeId}`)
    assert(concerns.has(cell.concern), `Matrix references undeclared concern ${cell.concern}`)
    for (const hash of cell.documentRefs ?? []) assert(documents.get(hash)?.kind === 'Document', `Matrix Document reference ${hash} has wrong kind or is missing`)
    for (const hash of cell.skillRefs ?? []) assert(documents.get(hash)?.kind === 'Skill', `Matrix Skill reference ${hash} has wrong kind or is missing`)
  }
  for (const hash of context.systemPromptRefs ?? []) assert(documents.get(hash)?.kind === 'Prompt', `System prompt ${hash} has wrong kind or is missing`)

  const artifactIds = new Set()
  const sourcePaths = new Set(manifest.files.map((file) => file.path))
  for (const artifact of context.artifacts ?? []) {
    assert(!artifactIds.has(artifact.id), `Duplicate artifact ${artifact.id}`)
    artifactIds.add(artifact.id)
    assert(nodeById.has(artifact.nodeId), `Artifact ${artifact.id} references a missing node`)
    assert(concerns.has(artifact.concern), `Artifact ${artifact.id} references an undeclared concern`)
    if (artifact.type === 'Code') {
      assert(Array.isArray(artifact.sourcePaths) && artifact.sourcePaths.length > 0, `Code artifact ${artifact.id} requires sourcePaths`)
      for (const path of artifact.sourcePaths) assert(sourcePaths.has(path), `Code artifact ${artifact.id} references missing source ${path}`)
      assert(artifact.text === undefined, `Code artifact ${artifact.id} must not duplicate source content`)
    } else {
      assert(typeof artifact.text === 'string', `${artifact.type} artifact ${artifact.id} requires text`)
    }
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
