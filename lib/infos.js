const createNotify = require('pull-notify')
const pullConcat = require('pull-cat')
const pull = require('pull-stream')
const Obz = require('obz')

/**
 * @template T
 * @typedef {import('obz').Obz<T>} Obz
 */

/**
 * @typedef {import('./index').Address} Address
 * @typedef {import('./stats').StatsInfo} StatsInfo
 * @typedef {{
 *   state: 'connected' | 'disconnected' | 'connecting' | 'disconnecting',
 *   inferredType?: 'internet' | 'lan' | 'tunnel' | undefined;
 *   stats?: StatsInfo
 * }} Info
 */

class Infos {
  /** @type {Map<Address, Info>} */
  #map
  /** @type {ReturnType<createNotify>} */
  #notify
  /** @type {Obz<Address>} */
  #onStatsUpdated

  constructor() {
    this.#map = new Map()
    this.#notify = createNotify()
    this.#onStatsUpdated = Obz()
  }

  /**
   * @param {Address} address
   * @returns {Info | undefined}
   */
  get(address) {
    return this.#map.get(address)
  }

  /**
   * @param {Address} address
   * @returns {boolean}
   */
  has(address) {
    return this.#map.has(address)
  }

  /**
   * @param {Address} address
   * @param {Partial<Info>} info
   * @returns {void}
   */
  update(address, info) {
    const hasNewStats = !!info.stats
    const prevInfo = this.#map.get(address)
    if (prevInfo) {
      for (const key of Object.keys(info)) {
        const k = /**@type {keyof Info}*/ (key)
        if (typeof info[k] === 'undefined') delete info[k]
      }
      this.#map.set(address, { ...prevInfo, ...info })
    } else if (!info.state) {
      this.#map.set(address, { ...info, state: 'disconnected' })
    } else {
      this.#map.set(address, /**@type {Info}*/ (info))
    }
    if (hasNewStats) {
      this.#onStatsUpdated.set(address)
    }
  }

  /**
   * @param {Address} address
   * @param {(prevStats: Partial<Info['stats']>) => Partial<Info['stats']>} getStats
   * @returns {void}
   */
  updateStats(address, getStats) {
    const prevInfo = this.#map.get(address)
    if (!prevInfo) return
    this.#map.set(address, {
      ...prevInfo,
      stats: {
        ...prevInfo?.stats,
        ...getStats(prevInfo?.stats),
      },
    })
    this.#onStatsUpdated.set(address)
  }

  /**
   * @param {Parameters<Obz<Address>>[0]} listener
   */
  onStatsUpdated(listener) {
    return this.#onStatsUpdated(listener)
  }

  /**
   * @param {Address} address
   */
  remove(address) {
    this.#map.delete(address)
    this.#onStatsUpdated.set(address)
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
   * @returns {pull.Source<[Address, Info]>}
   */
  liveEntries() {
    return pullConcat([
      pull.values([Array.from(this.#map.entries())]),
      this.#notify.listen(),
    ])
  }
}

module.exports = Infos
