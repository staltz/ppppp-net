const createNotify = require('pull-notify')
const pullConcat = require('pull-cat')
const pull = require('pull-stream')
const Obz = require('obz')

/**
 * @template T
 * @typedef {import('obz').Obz<T>} Obz
 */

/**
 * @typedef {import('./index').Multiaddr} Multiaddr
 * @typedef {import('./stats').StatsInfo} StatsInfo
 * @typedef {{
 *   state: 'connected' | 'disconnected' | 'connecting' | 'disconnecting',
 *   inferredType?: 'internet' | 'lan' | 'tunnel' | undefined;
 *   stats?: StatsInfo
 * }} Info
 */

class Infos {
  /** @type {Map<Multiaddr, Info>} */
  #map
  /** @type {ReturnType<createNotify>} */
  #notify
  /** @type {Obz<Multiaddr>} */
  #onStatsUpdated

  constructor() {
    this.#map = new Map()
    this.#notify = createNotify()
    this.#onStatsUpdated = Obz()
  }

  /**
   * @param {Multiaddr} multiaddr
   * @returns {Info | undefined}
   */
  get(multiaddr) {
    return this.#map.get(multiaddr)
  }

  /**
   * @param {Multiaddr} multiaddr
   * @returns {boolean}
   */
  has(multiaddr) {
    return this.#map.has(multiaddr)
  }

  /**
   * @param {Multiaddr} multiaddr
   * @param {Partial<Info>} info
   * @returns {void}
   */
  update(multiaddr, info) {
    const hasNewStats = !!info.stats
    const prevInfo = this.#map.get(multiaddr)
    if (prevInfo) {
      for (const key of Object.keys(info)) {
        const k = /**@type {keyof Info}*/ (key)
        if (typeof info[k] === 'undefined') delete info[k]
      }
      this.#map.set(multiaddr, { ...prevInfo, ...info })
    } else if (!info.state) {
      this.#map.set(multiaddr, { ...info, state: 'disconnected' })
    } else {
      this.#map.set(multiaddr, /**@type {Info}*/ (info))
    }
    if (hasNewStats) {
      this.#onStatsUpdated.set(multiaddr)
    }
  }

  /**
   * @param {Multiaddr} multiaddr
   * @param {(prevStats: Partial<Info['stats']>) => Partial<Info['stats']>} getStats
   * @returns {void}
   */
  updateStats(multiaddr, getStats) {
    const prevInfo = this.#map.get(multiaddr)
    if (!prevInfo) return
    this.#map.set(multiaddr, {
      ...prevInfo,
      stats: {
        ...prevInfo?.stats,
        ...getStats(prevInfo?.stats),
      },
    })
    this.#onStatsUpdated.set(multiaddr)
  }

  /**
   * @param {Parameters<Obz<Multiaddr>>[0]} listener
   */
  onStatsUpdated(listener) {
    return this.#onStatsUpdated(listener)
  }

  /**
   * @param {Multiaddr} multiaddr
   */
  remove(multiaddr) {
    this.#map.delete(multiaddr)
    this.#onStatsUpdated.set(multiaddr)
  }

  size() {
    return this.#map.size
  }

  emit() {
    this.#notify(Array.from(this.#map.entries()))
  }

  entries() {
    return this.#map.entries()
  }

  /**
   * @returns {pull.Source<[Multiaddr, Info]>}
   */
  liveEntries() {
    return pullConcat([
      pull.values([Array.from(this.#map.entries())]),
      this.#notify.listen(),
    ])
  }
}

module.exports = Infos
