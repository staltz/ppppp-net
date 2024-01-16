const test = require('node:test')
const assert = require('node:assert')
const FS = require('node:fs')
const Path = require('node:path')
const p = require('node:util').promisify
const { createPeerMock } = require('./util')

const PUBKEY = 'EqTMFv7zm8hpPyAkj789qdJgqtz81AEbcinpAs24RRUC'
const TEST_ADDR = `/ip4/127.0.0.1/tcp/9752/shse/${PUBKEY}`

test('Glueing together stats with connections', async (t) => {
  await t.test('stage() is ignored when peer already connected', async () => {
    const peer = createPeerMock()

    const address = TEST_ADDR
    const result = await p(peer.net.connect)(address)
    assert.ok(result, 'connect was succesful')

    const entriesBefore = await p(peer.net.peers())(null)
    assert.equal(entriesBefore.length, 1, 'there is one entry in peers()')
    assert.equal(entriesBefore[0][0], address, 'entry addr ok')
    assert.equal(entriesBefore[0][1].state, 'connected', 'entry state ok')

    const stagingResult = peer.net.stage(address, { mode: 'internet' })
    assert.equal(stagingResult, false, 'stage() should refuse')

    const entriesAfter = await p(peer.net.peers())(null)
    assert.equal(entriesAfter.length, 1, 'there is one entry in peers()')
    assert.equal(entriesAfter[0][0], address, 'entry addr ok')
    assert.equal(entriesAfter[0][1].state, 'connected', 'entry state ok')
  })

  await t.test('stage() successful', async (t) => {
    const peer = createPeerMock()
    const address = TEST_ADDR

    const entriesBefore = await p(peer.net.peers())(null)
    assert.equal(entriesBefore.length, 0, 'there is no entry in peers()')

    const stagingResult = peer.net.stage(address, { mode: 'internet' })
    assert.equal(stagingResult, true, 'stage() successful')

    const entriesAfter = await p(peer.net.peers())(null)
    assert.equal(entriesAfter.length, 1, 'there is one entry in peers()')
    assert.equal(entriesAfter[0][0], address, 'entry addr ok')
    assert.equal(entriesAfter[0][1].state, 'disconnected', 'entry state ok')
  })

  await t.test('connect() will trigger stats persistence', async (t) => {
    const peer = createPeerMock()
    const address = TEST_ADDR

    const entriesBefore = await p(peer.net.peers())(null)
    assert.equal(entriesBefore.length, 0, 'there is no entry in peers()')

    const rpc = await p(peer.net.connect)(address)
    assert.ok(rpc, 'connect() successful')

    const statsJSONPath = Path.join(peer.mockDir, 'net', './stats.json')
    while (FS.existsSync(statsJSONPath) === false) {
      await p(setTimeout)(1)
    }
    const fileContents = FS.readFileSync(statsJSONPath, 'utf8')
    const json = JSON.parse(fileContents)
    assert.deepEqual(Object.keys(json), [TEST_ADDR])
    assert.deepEqual(Object.keys(json[TEST_ADDR]), ['stateChange'])
  })

  await t.test('forget() will remove stats', async (t) => {
    const peer = createPeerMock()
    const address = TEST_ADDR

    const entriesBefore = await p(peer.net.peers())(null)
    assert.equal(entriesBefore.length, 0, 'there is no entry in peers()')

    const rpc = await p(peer.net.connect)(address)
    assert.ok(rpc, 'connect() successful')

    const statsJSONPath = Path.join(peer.mockDir, 'net', './stats.json')
    while (FS.existsSync(statsJSONPath) === false) {
      await p(setTimeout)(1)
    }
    const fileContents = FS.readFileSync(statsJSONPath, 'utf8')
    assert.equal(fileContents.length > 10, true, 'stats.json is not empty')

    peer.net.forget(address)
    await p(setTimeout)(200)

    const entriesAfterForget = await p(peer.net.peers())(null)
    assert.equal(entriesAfterForget.length, 0, 'there is no entry in peers()')

    const fileContents2 = FS.readFileSync(statsJSONPath, 'utf8')
    assert.equal(fileContents2, '{}', 'stats.json is empty')
  })
})
