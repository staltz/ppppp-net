const OS = require('node:os')
const FS = require('node:fs')
const Path = require('node:path')
const rimraf = require('rimraf')
const caps = require('ppppp-caps')
const Keypair = require('ppppp-keypair')
const net = require('../lib/index')

function createPeer(config) {
  if (config.name) {
    const name = config.name
    const tmp = OS.tmpdir()
    config.global ??= {}
    config.global.path ??= Path.join(tmp, `ppppp-net-${name}-${Date.now()}`)
    config.global.keypair ??= Keypair.generate('ed25519', name)
    delete config.name
  }
  if (!config.global) {
    throw new Error('need config.global in createPeer()')
  }
  if (!config.global.path) {
    throw new Error('need config.global.path in createPeer()')
  }
  if (!config.global.keypair) {
    throw new Error('need config.global.keypair in createPeer()')
  }

  rimraf.sync(config.global.path)
  return require('secret-stack/bare')()
    .use(require('secret-stack/plugins/net'))
    .use(require('secret-handshake-ext/secret-stack'))
    .use(net)
    .call(null, {
      shse: { caps },
      ...config,
      global: {
        connections: {
          incoming: {
            net: [{ scope: 'device', transform: 'shse', port: null }],
          },
          outgoing: {
            net: [{ transform: 'shse' }],
          },
        },
        ...config.global,
      },
    })
}

function createPeerMock() {
  const testPath = FS.mkdtempSync(Path.join(OS.tmpdir(), 'ppppp-net-'))

  const mockPeer = {
    addListener() {},
    close: {
      hook: () => {},
    },
    post: () => {},
    connect: (_address, cb) => {
      setTimeout(() => {
        cb(null, {
          once: () => {},
          net: {
            ping() {
              return {
                source: () => {},
                sink: () => {},
              }
            },
          },
        })
      }, 200)
    },
    once: () => {},
    multiserver: {
      parse: () => [[{ name: 'net', host: 'localhost', port: 9752 }]],
    },
    mockDir: testPath,
  }
  const mockConfig = {
    global: {
      path: testPath,
    },
    net: {
      persistTimeout: 0,
    }
    // shse: { caps }
  }

  mockPeer.net = net.init(mockPeer, mockConfig)

  return mockPeer
}

module.exports = { createPeer, createPeerMock }
