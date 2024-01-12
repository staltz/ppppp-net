const test = require('node:test')
const assert = require('node:assert')
const p = require('node:util').promisify
const { createPeerMock } = require('./util')

const TEST_ADDR =
  'net:localhost:9752~shse:EqTMFv7zm8hpPyAkj789qdJgqtz81AEbcinpAs24RRUC'

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
    assert.equal(stagingResult, true, 'stage() should refuse')

    const entriesAfter = await p(peer.net.peers())(null)
    assert.equal(entriesAfter.length, 1, 'there is one entry in peers()')
    assert.equal(entriesAfter[0][0], address, 'entry addr ok')
    assert.equal(entriesAfter[0][1].state, 'disconnected', 'entry state ok')
  })
})
