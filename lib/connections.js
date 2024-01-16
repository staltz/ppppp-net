const debug = require('debug')('ppppp:net:connections')
const createNotify = require('pull-notify')
const run = require('promisify-tuple')
const IP = require('ip')
const Multiaddr = require('./multiaddr')

/**
 * @typedef {import('./index').RpcConnectListener} RpcConnectListener
 * @typedef {import('./index').Multiaddr} Multiaddr
 * @typedef {import('./index').RPC} RPC
 * @typedef {import('./index').Peer} Peer
 * @typedef {import('./infos').Info} Info
 * @typedef {import('./infos')} Infos
 * @typedef {{
 *   type:
 *     | 'connecting'
 *     | 'connected'
 *     | 'connecting-failed'
 *     | 'disconnecting'
 *     | 'disconnected';
 *   multiaddr: Multiaddr;
 *   pubkey: string | undefined;
 *   details?: any;
 * }} ConnectionEvent
 * @typedef {{
 *   (ev: ConnectionEvent): void;
 *   listen: () => import('pull-stream').Source<ConnectionEvent>;
 *   end: () => void;
 * }} NotifyEvent
 */

class Connections {
  /** @type {Peer} */
  #peer
  /** @type {Infos} */
  #infos
  /** @type {boolean} */
  #closed
  /** @type {NotifyEvent} */
  #notifyEvent
  /** @type {Map<Multiaddr, RPC>} */
  #rpcs

  /**
   * Used only to schedule a connect when a disconnect is in progress.
   * @type {Set<Multiaddr>}
   */
  #connectRetries

  /**
   * @param {Peer} peer
   * @param {Infos} infos
   */
  constructor(peer, infos) {
    this.#peer = peer
    this.#infos = infos
    this.#closed = false
    this.#notifyEvent = /**@type {any}*/ (createNotify())
    this.#rpcs = new Map()
    this.#connectRetries = new Set()

    this.#peer.addListener('rpc:connect', this.#onRpcConnect)
  }

  /**
   * @param {string} address
   * @returns {Info['inferredType']}
   */
  static inferPeerType(address) {
    if (address.startsWith('tunnel:')) return 'tunnel'
    if (address.startsWith('net:')) {
      const netAddr = address.split('~')[0]
      const [, host, port] = netAddr.split(':')
      if (host) {
        if (IP.isPrivate(host)) return 'lan'
        else return 'internet'
      }
    }
    return
  }

  /**
   * @param {string} addresses
   * @returns {string | undefined}
   */
  static extractSHSEPubkey(addresses) {
    for (const address of addresses.split(';')) {
      const [transport, transform] = address.split('~')
      const [name, pubkey, extra] = transform.split(':')
      if (name === 'shse') {
        return pubkey
      }
    }
  }

  #assertNotClosed() {
    if (this.#closed) {
      throw new Error('This Connections instance is closed, create a new one.')
    }
  }

  /**
   * @type {RpcConnectListener}
   */
  #onRpcConnect = (rpc, weAreClient) => {
    // Don't process self connections, whatever that means:
    if (rpc.shse.pubkey === this.#peer.shse.pubkey) return
    // This branch is already handled by this.connect()
    if (weAreClient) return

    this.#prepareConnectedRPC(rpc.stream.address, rpc, weAreClient)
  }

  /**
   * @type {(address: string, rpc: RPC, weAreClient: boolean) => void}
   */
  #prepareConnectedRPC = (address, rpc, weAreClient) => {
    const initiator = weAreClient ? 'we' : 'they'
    const multiaddr = Multiaddr.fromMs(address)
    debug('Connected to %s, %s initiated it', multiaddr, initiator)

    const pubkey = Connections.extractSHSEPubkey(address)
    this.#rpcs.set(multiaddr, rpc)
    rpc.once('closed', () => {
      debug('Disconnected from %s', multiaddr)
      this.#rpcs.delete(multiaddr)
      this.#infos.update(multiaddr, { state: 'disconnected' })
      this.#notifyEvent({ type: 'disconnected', multiaddr, pubkey })
      this.#infos.emit()
    })

    const state = /**@type {Info['state']}*/ ('connected')
    const inferredType = Connections.inferPeerType(address)
    this.#infos.update(multiaddr, { state, inferredType })
    this.#notifyEvent({
      type: state,
      multiaddr,
      pubkey,
      details: { rpc, weAreClient },
    })
    this.#infos.emit()
  }

  /**
   * @param {Multiaddr} multiaddr
   * @returns {Promise<RPC>}
   */
  async connect(multiaddr) {
    this.#assertNotClosed()

    const address = Multiaddr.toMs(multiaddr)
    const prevInfo = this.#infos.get(multiaddr)
    switch (prevInfo?.state ?? 'disconnected') {
      case 'connected': {
        const rpc = this.#rpcs.get(multiaddr)
        if (!rpc) {
          // prettier-ignore
          throw new Error(`Failed to connect to ${multiaddr} due to inconsistent internal state`);
        }
        return rpc
      }

      case 'disconnecting': {
        // If disconnecting, schedule a connect() after disconnection completed
        this.#connectRetries.add(multiaddr)
        // note: control flow should fall through below!
      }
      case 'connecting': {
        return new Promise((resolve, reject) => {
          let timeout = 100
          const checkAgain = () => {
            const rpc = this.#rpcs.get(multiaddr)
            if (rpc) resolve(rpc)
            else if (timeout > 5 * 60e3) {
              // prettier-ignore
              reject(new Error(`Failed to connect to ${multiaddr} after waiting a long time`))
            } else {
              timeout *= 2
              setTimeout(checkAgain, timeout)
            }
          }
          checkAgain()
        })
      }

      case 'disconnected': {
        debug('Connecting to %s', multiaddr)
        const state = /**@type {Info['state']}*/ ('connecting')
        const pubkey = Connections.extractSHSEPubkey(address)
        this.#infos.update(multiaddr, { state })
        this.#notifyEvent({ type: state, multiaddr, pubkey })
        this.#infos.emit()

        const [err, rpc] = await run(this.#peer.connect)(address)
        if (err) {
          this.#infos.update(multiaddr, { state: 'disconnected' })
          debug('Failed to connect to %s because: %s', multiaddr, err.message)
          this.#notifyEvent({
            type: 'connecting-failed',
            multiaddr,
            pubkey,
            details: err,
          })
          this.#infos.emit()
          throw err
        }

        const concurrentInfo = this.#infos.get(multiaddr)
        if (!concurrentInfo || concurrentInfo.state !== 'connected') {
          this.#prepareConnectedRPC(address, rpc, true)
          return rpc
        } else {
          const rpc2 = this.#rpcs.get(multiaddr)
          if (!rpc2) {
            // prettier-ignore
            throw new Error(`Failed to connect to ${multiaddr} due to inconsistent internal state`);
          }
          return rpc2
        }
      }

      default: {
        // prettier-ignore
        debug('Unexpected control flow, peer %s has bad state %o', multiaddr, prevInfo)
        // prettier-ignore
        throw new Error(`Unexpected control flow, peer ${multiaddr} has bad state "${prevInfo?.state ?? '?'}"`)
      }
    }
  }

  /**
   * @param {Multiaddr} multiaddr
   * @returns {Promise<boolean>}
   */
  async disconnect(multiaddr) {
    this.#assertNotClosed()
    const address = Multiaddr.toMs(multiaddr)
    const prevInfo = this.#infos.get(multiaddr)
    if (!prevInfo || prevInfo?.state === 'disconnected') return false
    if (prevInfo.state === 'disconnecting') return false

    /**@type {RPC}*/
    let rpc
    if (prevInfo.state === 'connecting') {
      rpc = await new Promise((resolve) => {
        let timeout = 100
        const checkAgain = () => {
          const rpc = this.#rpcs.get(multiaddr)
          if (rpc) resolve(rpc)
          else {
            timeout *= 2
            timeout = Math.min(timeout, 30e3)
            setTimeout(checkAgain, 100)
          }
        }
        checkAgain()
      })
    } else if (prevInfo.state === 'connected') {
      const maybeRPC = this.#rpcs.get(multiaddr)
      if (!maybeRPC) {
        // prettier-ignore
        throw new Error(`Failed to disconnect from ${multiaddr} due to inconsistent internal state`);
      } else {
        rpc = maybeRPC
      }
    }

    debug('Disconnecting from %s', multiaddr)
    const state = /**@type {Info['state']}*/ ('disconnecting')
    const pubkey = Connections.extractSHSEPubkey(address)
    this.#infos.update(multiaddr, { state })
    this.#notifyEvent({ type: state, multiaddr, pubkey })
    this.#infos.emit()
    // @ts-ignore
    await run(rpc.close)(true)
    // Additional cleanup will execute in the "closed" event handler

    // Re-connect because while disconnect() was running,
    // someone called connect()
    if (this.#connectRetries.has(multiaddr)) {
      this.#connectRetries.delete(multiaddr)
      this.connect(multiaddr)
    }

    return true
  }

  /**
   * @returns {import('pull-stream').Source<ConnectionEvent>}
   */
  listen() {
    this.#assertNotClosed()
    return /**@type {any}*/ (this.#notifyEvent.listen())
  }

  reset() {
    if (this.#closed) return
    for (const rpc of this.#rpcs.values()) {
      rpc.close(true)
    }
  }

  close() {
    this.reset()
    this.#peer.removeListener('rpc:connect', this.#onRpcConnect)
    this.#closed = true
    this.#rpcs.clear()
    this.#connectRetries.clear()
    this.#notifyEvent.end()
    debug('Closed')
  }
}

module.exports = Connections
