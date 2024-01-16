const test = require('node:test')
const assert = require('node:assert')
const Multiaddr = require('../lib/multiaddr')

const PUBKEY = 'EqTMFv7zm8hpPyAkj789qdJgqtz81AEbcinpAs24RRUC'
const PUBKEY2 = 'EqTMFv7zm8hpPyAkj789qdJgqtz81AEbcinpAs35RRUC'

test('Multiaddr', async (t) => {
  await t.test('ip4+tcp', async () => {
    const multiaddr = '/ip4/127.0.0.1/tcp/8008'
    const ms = 'net:127.0.0.1:8008'
    assert.equal(Multiaddr.toMs(multiaddr), ms)
    assert.equal(Multiaddr.fromMs(ms), multiaddr)
  })

  await t.test('ip4+tcp+shse', async () => {
    const multiaddr = `/ip4/127.0.0.1/tcp/8008/shse/${PUBKEY}`
    const ms = `net:127.0.0.1:8008~shse:${PUBKEY}`
    assert.equal(Multiaddr.toMs(multiaddr), ms)
    assert.equal(Multiaddr.fromMs(ms), multiaddr)
  })

  await t.test('ip4+tcp+shse+token', async () => {
    const multiaddr = `/ip4/127.0.0.1/tcp/8008/shse/${PUBKEY}.TOKEN`
    const ms = `net:127.0.0.1:8008~shse:${PUBKEY}:TOKEN`
    assert.equal(Multiaddr.toMs(multiaddr), ms)
    assert.equal(Multiaddr.fromMs(ms), multiaddr)
  })

  await t.test('dns+tcp+shse', async () => {
    const multiaddr = `/dns/staltz.com/tcp/8008/shse/${PUBKEY}`
    const ms = `net:staltz.com:8008~shse:${PUBKEY}`
    assert.equal(Multiaddr.toMs(multiaddr), ms)
    assert.equal(Multiaddr.fromMs(ms), multiaddr)
  })

  await t.test('dns+tcp+shse+token', async () => {
    const multiaddr = `/dns/staltz.com/tcp/8008/shse/${PUBKEY}.TOKEN`
    const ms = `net:staltz.com:8008~shse:${PUBKEY}:TOKEN`
    assert.equal(Multiaddr.toMs(multiaddr), ms)
    assert.equal(Multiaddr.fromMs(ms), multiaddr)
  })

  await t.test('tunnel', async () => {
    const multiaddr = `/tunnel/${PUBKEY}.${PUBKEY2}`
    const ms = `tunnel:${PUBKEY}:${PUBKEY2}`
    assert.equal(Multiaddr.toMs(multiaddr), ms)
    assert.equal(Multiaddr.fromMs(ms), multiaddr)
  })

  await t.test('tunnel+shse', async () => {
    const multiaddr = `/tunnel/${PUBKEY}.${PUBKEY2}/shse/${PUBKEY2}`
    const ms = `tunnel:${PUBKEY}:${PUBKEY2}~shse:${PUBKEY2}`
    assert.equal(Multiaddr.toMs(multiaddr), ms)
    assert.equal(Multiaddr.fromMs(ms), multiaddr)
  })

  await t.test('tunnel+shse+token', async () => {
    const multiaddr = `/tunnel/${PUBKEY}.${PUBKEY2}/shse/${PUBKEY2}.TOKEN`
    const ms = `tunnel:${PUBKEY}:${PUBKEY2}~shse:${PUBKEY2}:TOKEN`
    assert.equal(Multiaddr.toMs(multiaddr), ms)
    assert.equal(Multiaddr.fromMs(ms), multiaddr)
  })
})
