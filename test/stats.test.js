const test = require('node:test')
const assert = require('node:assert')
const Path = require('node:path')
const FS = require('node:fs')
const p = require('node:util').promisify
const Stats = require('../lib/stats')
const Infos = require('../lib/infos')

test('Stats', async (t) => {
  await t.test('Recovers from corrupted JSON file', async () => {
    const dirPath = Path.join(__dirname, './fixtures/corrupted')
    const statsJSONPath = Path.join(dirPath, './stats.json')
    const fileContents = FS.readFileSync(statsJSONPath, 'utf8')
    console.log(fileContents);

    const infos = new Infos()
    const stats = new Stats(dirPath, infos)
    assert.ok(stats, 'Stats instance was created')

    const entriesBefore = Array.from(infos.entries())
    assert.equal(entriesBefore.length, 0, 'before loaded(), there is no data')

    await stats.loaded()
    const entriesAfter = Array.from(infos.entries())
    assert.equal(entriesAfter.length, 1, 'after loaded(), there is data')
    const [address, info] = entriesAfter[0]
    assert.equal(address, 'net:staltz.com:8008~noauth', 'the address looks ok')
    assert.equal(info.stats.source, 'stored', 'the info looks ok')

    stats.close()
    await p(setTimeout)(50)
    FS.writeFileSync(statsJSONPath, fileContents)
  })

  await t.test('Creates JSON file when it is absent', async () => {
    const dirPath = Path.join(__dirname, './fixtures/absent')
    const statsJSONPath = Path.join(dirPath, './stats.json')
    assert.equal(FS.existsSync(statsJSONPath), false, 'stats.json doesnt exist')

    const infos = new Infos()
    const stats = new Stats(dirPath, infos)
    assert.ok(stats, 'Stats instance was created')

    while (FS.existsSync(statsJSONPath) === false) {
      await p(setTimeout)(1)
    }

    const fileContents = FS.readFileSync(statsJSONPath, 'utf8')
    assert.equal(fileContents, '{}', 'stats.json data should be empty JSON')

    FS.unlinkSync(statsJSONPath)
  })

  await t.test('Loads when JSON file is present', async () => {
    const dirPath = Path.join(__dirname, './fixtures/present')
    const statsJSONPath = Path.join(dirPath, './stats.json')
    assert.equal(FS.existsSync(statsJSONPath), true, 'stats.json exists')

    const infos = new Infos()
    const stats = new Stats(dirPath, infos)
    assert.ok(stats, 'Stats instance was created')

    await stats.loaded()

    const entries = Array.from(infos.entries())
    assert.equal(entries.length === 1, true, 'stats has one entry')
    assert.equal(entries[0][0], 'net:staltz.com:8008~noauth', 'entry addr ok')
    assert.ok(entries[0][1].stats.duration, 'entry stats.duration ok')
  })

  await t.test('Cannot recover from totally broken JSON file', async () => {
    const dirPath = Path.join(__dirname, './fixtures/irrecoverable')

    const infos = new Infos()
    const stats = new Stats(dirPath, infos)
    assert.ok(stats, 'Stats instance was created')

    const entriesBefore = Array.from(infos.entries())
    assert.equal(entriesBefore.length, 0, 'before loaded(), there is no data')

    await stats.loaded()

    const entriesAfter = Array.from(infos.entries())
    assert.equal(entriesAfter.length, 0, 'after loaded(), there is data')
  })
})
