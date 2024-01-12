const pullPing = require('pull-ping')
const Path = require('path')
const Infos = require('./infos')
const Stats = require('./stats')
const Connections = require('./connections')
const Scheduler = require('./scheduler')

/**
 * @typedef {string} Address
 * @typedef {(rpc: RPC, weAreClient: boolean) => void} RpcConnectListener
 * @typedef {{
 *   shse: {pubkey: string};
 *   close: {
 *     (errOrEnd: boolean, cb?: CB<void>): void,
 *     hook(hookIt: (this: unknown, fn: any, args: any) => any): void
 *   };
 *   connect(address: string, cb: CB<RPC>): void;
 *   once(event: 'closed', cb: CB<void>): void;
 *   addListener(event: 'rpc:connect', listener: RpcConnectListener): void;
 *   removeListener(event: 'rpc:connect', listener: RpcConnectListener): void;
 * }} Peer
 * @typedef {Peer & {stream: {address: string}}} RPC
 * @typedef {{
 *   global: {
 *     path?: string
 *     timers?: {
 *       ping?: number
 *     },
 *   },
 *   net?: {
 *     autostart?: boolean,
 *     persistTimeout?: number,
 *   },
 * }} Config
 * @typedef {Config & {global: {path: string}}} ExpectedConfig
 * @typedef {import('./infos').Info} Info
 */

/**
 * @template T
 * @typedef {(...args: [Error] | [null, T]) => void } CB
 */

/**
 * @param {Config} config
 * @returns {asserts config is ExpectedConfig}
 */
function assertValidConfig(config) {
  if (typeof config.global?.path !== 'string') {
    throw new Error('net plugin requires config.global.path')
  }
}

/**
 * @param {Peer} peer
 * @param {Config} config
 */
function initNet(peer, config) {
  assertValidConfig(config)
  const autostart = config.net?.autostart ?? true
  const netDir = Path.join(config.global.path, 'net')

  const infos = new Infos()
  const stats = new Stats(netDir, infos, config.net?.persistTimeout)
  const connections = new Connections(peer, infos)
  const scheduler = new Scheduler()

  peer.close.hook(function (fn, args) {
    scheduler.stop()
    connections.close()
    stats.close()
    return fn.apply(this, args)
  })

  if (autostart) {
    start()
  }

  async function start() {
    await stats.loaded()
    queueMicrotask(scheduler.start.bind(scheduler))
  }

  function stop() {
    scheduler.stop()
  }

  /**
   * @param {Address} address
   * @param {Partial<Info>} info
   */
  function stage(address, info) {
    if (info.state) throw new Error('Cannot stage peer info with "state" field')
    if (infos.has(address)) {
      return false
    } else {
      infos.update(address, info)
      return true
    }
  }

  /**
   * @param {Address} address
   * @param {CB<RPC>} cb
   */
  function connect(address, cb) {
    connections.connect(address).then(
      (result) => cb(null, result),
      (err) => cb(err)
    )
  }

  /**
   * @param {Address} address
   * @param {CB<boolean>} cb
   */
  function disconnect(address, cb) {
    return connections.disconnect(address).then(
      (result) => cb(null, result),
      (err) => cb(err)
    )
  }

  /**
   * @param {Address} address
   * @param {Info} info
   */
  function updateInfo(address, info) {
    infos.update(address, info)
  }

  function listen() {
    return connections.listen()
  }

  function peers() {
    return infos.liveEntries()
  }

  function ping() {
    const MIN = 10e3 // 10sec
    const DEFAULT = 5 * 60e3 // 5min
    const MAX = 30 * 60e3 // 30min
    let timeout = config.global.timers?.ping ?? DEFAULT
    timeout = Math.max(MIN, Math.min(timeout, MAX))
    return pullPing({ timeout })
  }

  return {
    start,
    stop,
    stage,
    connect,
    disconnect,
    updateInfo,
    listen,
    peers,
    ping,
  }
}

exports.name = 'net'
exports.manifest = {
  start: 'sync',
  stop: 'sync',
  stage: 'sync',
  connect: 'async',
  disconnect: 'async',
  listen: 'source',
  peers: 'source',
  ping: 'duplex',
}
exports.permissions = {
  anonymous: { allow: ['ping'] },
}
exports.init = initNet
