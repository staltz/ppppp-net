const test = require('node:test')
const assert = require('node:assert')
const Multiaddr = require('../lib/multiaddr')

const PUBKEY = 'EqTMFv7zm8hpPyAkj789qdJgqtz81AEbcinpAs24RRUC'
const PUBKEY2 = 'EqTMFv7zm8hpPyAkj789qdJgqtz81AEbcinpAs35RRUC'

test('Multiaddr', async (t) => {
  await t.test('toMs ip4+tcp', async () => {
    assert.equal(
      Multiaddr.toMs('/ip4/127.0.0.1/tcp/8008'),
      'net:127.0.0.1:8008'
    )
  })

  await t.test('toMs ip4+tcp+shse', async () => {
    assert.equal(
      Multiaddr.toMs(`/ip4/127.0.0.1/tcp/8008/shse/${PUBKEY}`),
      `net:127.0.0.1:8008~shse:${PUBKEY}`
    )
  })

  await t.test('toMs ip4+tcp+shse+token', async () => {
    assert.equal(
      Multiaddr.toMs(`/ip4/127.0.0.1/tcp/8008/shse/${PUBKEY}.TOKEN`),
      `net:127.0.0.1:8008~shse:${PUBKEY}:TOKEN`
    )
  })

  await t.test('toMs dns+tcp+shse', async () => {
    assert.equal(
      Multiaddr.toMs(`/dns/staltz.com/tcp/8008/shse/${PUBKEY}`),
      `net:staltz.com:8008~shse:${PUBKEY}`
    )
  })

  await t.test('toMs dns+tcp+shse+token', async () => {
    assert.equal(
      Multiaddr.toMs(`/dns/staltz.com/tcp/8008/shse/${PUBKEY}.TOKEN`),
      `net:staltz.com:8008~shse:${PUBKEY}:TOKEN`
    )
  })

  await t.test('toMs tunnel', async () => {
    assert.equal(
      Multiaddr.toMs(`/tunnel/${PUBKEY}.${PUBKEY2}`),
      `tunnel:${PUBKEY}:${PUBKEY2}`
    )
  })

  await t.test('toMs tunnel+shse', async () => {
    assert.equal(
      Multiaddr.toMs(`/tunnel/${PUBKEY}.${PUBKEY2}/shse/${PUBKEY2}`),
      `tunnel:${PUBKEY}:${PUBKEY2}~shse:${PUBKEY2}`
    )
  })

  await t.test('toMs tunnel+shse+token', async () => {
    assert.equal(
      Multiaddr.toMs(`/tunnel/${PUBKEY}.${PUBKEY2}/shse/${PUBKEY2}.TOKEN`),
      `tunnel:${PUBKEY}:${PUBKEY2}~shse:${PUBKEY2}:TOKEN`
    )
  })
})
