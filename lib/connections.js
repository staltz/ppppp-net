const debug = require('debug')('ppppp:net:connections')
const createNotify = require('pull-notify')
const run = require('promisify-tuple')
const IP = require('ip')

/**
 * @typedef {import('./index').RpcConnectListener} RpcConnectListener
 * @typedef {import('./index').Address} Address
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
 *   address: Address;
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
  /** @type {Map<Address, RPC>} */
  #rpcs

  /**
   * Used only to schedule a connect when a disconnect is in progress.
   * @type {Set<Address>}
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
   * @param {Address} address
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
   * @type {(address: Address, rpc: RPC, weAreClient: boolean) => void}
   */
  #prepareConnectedRPC = (address, rpc, weAreClient) => {
    const initiator = weAreClient ? 'we' : 'they'
    debug('Connected to %s, %s initiated it', address, initiator)

    const pubkey = Connections.extractSHSEPubkey(address)
    this.#rpcs.set(address, rpc)
    rpc.once('closed', () => {
      debug('Disconnected from %s', address)
      this.#rpcs.delete(address)
      this.#infos.update(address, { state: 'disconnected' })
      this.#notifyEvent({ type: 'disconnected', address, pubkey })
      this.#infos.emit()
    })

    const state = /**@type {Info['state']}*/ ('connected')
    const inferredType = Connections.inferPeerType(address)
    this.#infos.update(address, { state, inferredType })
    this.#notifyEvent({
      type: state,
      address,
      pubkey,
      details: { rpc, weAreClient },
    })
    this.#infos.emit()
  }

  /**
   * @param {string} address
   * @returns {Promise<RPC>}
   */
  async connect(address) {
    this.#assertNotClosed()

    const prevInfo = this.#infos.get(address)
    switch (prevInfo?.state ?? 'disconnected') {
      case 'connected': {
        const rpc = this.#rpcs.get(address)
        if (!rpc) {
          // prettier-ignore
          throw new Error(`Failed to connect to ${address} due to inconsistent internal state`);
        }
        return rpc
      }

      case 'disconnecting': {
        // If disconnecting, schedule a connect() after disconnection completed
        this.#connectRetries.add(address)
        // note: control flow should fall through below!
      }
      case 'connecting': {
        return new Promise((resolve, reject) => {
          let timeout = 100
          const checkAgain = () => {
            const rpc = this.#rpcs.get(address)
            if (rpc) resolve(rpc)
            else if (timeout > 5 * 60e3) {
              // prettier-ignore
              reject(new Error(`Failed to connect to ${address} after waiting a long time`))
            } else {
              timeout *= 2
              setTimeout(checkAgain, timeout)
            }
          }
          checkAgain()
        })
      }

      case 'disconnected': {
        debug('Connecting to %s', address)
        const state = /**@type {Info['state']}*/ ('connecting')
        const pubkey = Connections.extractSHSEPubkey(address)
        this.#infos.update(address, { state })
        this.#notifyEvent({ type: state, address, pubkey })
        this.#infos.emit()

        const [err, rpc] = await run(this.#peer.connect)(address)
        if (err) {
          this.#infos.update(address, { state: 'disconnected' })
          debug('Failed to connect to %s because: %s', address, err.message)
          this.#notifyEvent({
            type: 'connecting-failed',
            address,
            pubkey,
            details: err,
          })
          this.#infos.emit()
          throw err
        }

        const concurrentInfo = this.#infos.get(address)
        if (!concurrentInfo || concurrentInfo.state !== 'connected') {
          this.#prepareConnectedRPC(address, rpc, true)
          return rpc
        } else {
          const rpc2 = this.#rpcs.get(address)
          if (!rpc2) {
            // prettier-ignore
            throw new Error(`Failed to connect to ${address} due to inconsistent internal state`);
          }
          return rpc2
        }
      }

      default: {
        // prettier-ignore
        debug('Unexpected control flow, peer %s has bad state %o', address, prevInfo)
        // prettier-ignore
        throw new Error(`Unexpected control flow, peer ${address} has bad state "${prevInfo?.state ?? '?'}"`)
      }
    }
  }

  /**
   * @param {Address} address
   * @returns {Promise<boolean>}
   */
  async disconnect(address) {
    this.#assertNotClosed()
    const prevInfo = this.#infos.get(address)
    if (!prevInfo || prevInfo?.state === 'disconnected') return false
    if (prevInfo.state === 'disconnecting') return false

    /**@type {RPC}*/
    let rpc
    if (prevInfo.state === 'connecting') {
      rpc = await new Promise((resolve) => {
        let timeout = 100
        const checkAgain = () => {
          const rpc = this.#rpcs.get(address)
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
      const maybeRPC = this.#rpcs.get(address)
      if (!maybeRPC) {
        // prettier-ignore
        throw new Error(`Failed to disconnect from ${address} due to inconsistent internal state`);
      } else {
        rpc = maybeRPC
      }
    }

    debug('Disconnecting from %s', address)
    const state = /**@type {Info['state']}*/ ('disconnecting')
    const pubkey = Connections.extractSHSEPubkey(address)
    this.#infos.update(address, { state })
    this.#notifyEvent({ type: state, address, pubkey })
    this.#infos.emit()
    // @ts-ignore
    await run(rpc.close)(true)
    // Additional cleanup will execute in the "closed" event handler

    // Re-connect because while disconnect() was running,
    // someone called connect()
    if (this.#connectRetries.has(address)) {
      this.#connectRetries.delete(address)
      this.connect(address)
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
