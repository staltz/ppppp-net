const test = require('node:test')
const assert = require('node:assert')
const p = require('node:util').promisify
const pull = require('pull-stream')
const { createPeer } = require('./util')

const TEST_ADDR =
  'net:localhost:9752~shse:EqTMFv7zm8hpPyAkj789qdJgqtz81AEbcinpAs24RRUC'

test('net', async (t) => {
  await t.test('connect() rejects given unreachable address', async () => {
    const peer = createPeer({ name: 'alice' })
    await assert.rejects(p(peer.net.connect)(TEST_ADDR), (err) => {
      assert.equal(err.code, 'ECONNREFUSED', 'err.code is ECONNREFUSED')
      return true
    })
    await p(peer.close)(true)
  })

  await t.test('peers() emits all entries as they update', async () => {
    const peer = createPeer({ name: 'alice' })

    await new Promise((resolve, reject) => {
      let i = 0
      pull(
        peer.net.peers(),
        pull.drain((entries) => {
          ++i
          if (i === 1) {
            assert('FIRST EMISSION')
            assert.equal(entries.length, 0, 'entries === []')
          } else if (i === 2) {
            assert('SECOND EMISSION')
            assert.equal(entries.length, 1, 'there is one entry')
            const entry = entries[0]
            assert.equal(entry[0], TEST_ADDR, 'left is the address')
            assert.equal(typeof entry[1], 'object', 'right is the data')
            assert.equal(entry[1].state, 'connecting', 'state is connecting')
          } else if (i === 3) {
            assert('THIRD EMISSION')
            assert.equal(entries.length, 1, 'entries === []')
            const entry = entries[0]
            assert.equal(entry[0], TEST_ADDR, 'left is the address')
            assert.equal(typeof entry[1], 'object', 'right is the data')
            assert.equal(entry[1].state, 'disconnected', 'state disconnected')
            resolve()
          } else {
            reject(new Error('too many emissions'))
          }
        })
      )

      peer.net.connect(TEST_ADDR, () => {})
    })

    await p(peer.close)(true)
  })

  await t.test('listen() emits events', async () => {
    const peer = createPeer({ name: 'alice' })

    await new Promise((resolve, reject) => {
      let i = 0
      pull(
        peer.net.listen(),
        pull.drain((ev) => {
          try {
            ++i
            if (i === 1) {
              assert.equal(ev.type, 'connecting', 'event.type ok')
              assert.equal(ev.address, TEST_ADDR, 'event.address ok')
              assert.equal(ev.parsedAddress.length, 1)
              assert.equal(ev.parsedAddress[0].length, 2)
              assert.deepEqual(ev.parsedAddress[0][0], {
                name: 'net',
                host: 'localhost',
                port: 9752,
              })
              assert.equal(ev.parsedAddress[0][1].name, 'shse')
            } else if (i === 2) {
              assert.equal(ev.type, 'connecting-failed', 'event.type ok')
              assert.equal(ev.address, TEST_ADDR, 'event.address ok')
              assert.ok(ev.details, 'event.details ok')
              assert.equal(ev.details.code, 'ECONNREFUSED', 'event.details err')
              queueMicrotask(resolve)
            } else {
              queueMicrotask(() => reject(new Error('too many emissions')))
            }
          } catch (err) {
            reject(err)
          }
        })
      )

      peer.net.connect(TEST_ADDR, () => {})
    })

    await p(peer.close)(true)
  })
})
