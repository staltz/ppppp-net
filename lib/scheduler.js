const awaitable = require('pull-awaitable')
const run = require('promisify-tuple')
const debug = require('debug')('ppppp:net:scheduler')

/**
 * @typedef {ReturnType<import('ppppp-db').init>} PPPPPDB
 * @typedef {ReturnType<import('ppppp-set').init>} PPPPPSet
 * @typedef {`/${string}`} Multiaddr
 * @typedef {import('./infos')} Infos
 * @typedef {import('./connections')} Connections
 * @typedef {{
 *   db?: PPPPPDB;
 *   set?: PPPPPSet;
 *   shse: {
 *     pubkey: string;
 *   }
 * }} Peer
 */

class Scheduler {
  /** @type {Peer} */
  #peer
  /** @type {Connections} */
  #connections
  /** @type {boolean} */
  #closed

  /**
   * @param {Peer} peer
   * @param {Connections} connections
   */
  constructor(peer, connections) {
    this.#peer = peer
    this.#connections = connections
    this.#closed = true
  }

  /**
   * @param {Multiaddr} multiaddr
   */
  async #scheduleWithHub(multiaddr) {
    /**@type {any}*/
    let hubRPC
    try {
      hubRPC = await this.#connections.connect(multiaddr)
    } catch (err) {
      debug('Failed to connect to hub at "%s" because %o', multiaddr, err)
      return
    }

    const attendantsStream = awaitable(hubRPC.hub.attendants())
    const hubPubkey = hubRPC.shse.pubkey
    for await (const attendants of attendantsStream) {
      for (const attendant of attendants) {
        if (attendant !== this.#peer.shse.pubkey) {
          const tunnelMultiaddr = /** @type {Multiaddr} */ (
            `/tunnel/${hubPubkey}.${attendant}/shse/${attendant}`
          )
          this.#connections.connect(tunnelMultiaddr)
        }
      }
    }
  }

  #setupHubDiscovery() {
    /** @type {Array<Multiaddr> | undefined} */
    const multiaddrs = this.#peer.set?.values('hubs')
    if (!multiaddrs) return
    for (const multiaddr of multiaddrs) {
      this.#scheduleWithHub(multiaddr)
    }
    // @ts-ignore
    const stopWatch = this.#peer.set?.watch(({subdomain, event, value}) => {
      if (subdomain === 'hubs' && event === 'add') {
        this.#scheduleWithHub(value)
      }
    });
  }

  start() {
    if (!this.#closed) return
    this.#closed = false
    this.#setupHubDiscovery();
  }

  stop() {
    this.#closed = true
    // FIXME: implement
  }
}

module.exports = Scheduler
