const createNotify = require('pull-notify')
const pullConcat = require('pull-cat')
const pull = require('pull-stream')

/**
 * @typedef {import('./index').Address} Address
 * @typedef {import('./stats').StatsInfo} StatsInfo
 * @typedef {{
 *   state: 'connected' | 'disconnected' | 'connecting' | 'disconnecting',
 *   connBirth?: number,
 *   connUpdated?: number,
 *   inferredType?: 'internet' | 'lan' | 'tunnel' | undefined;
 *   stats?: StatsInfo
 * }} Info
 */

class Infos {
  /** @type {Map<Address, Info>} */
  #map
  /** @type {ReturnType<createNotify>} */
  #notify

  constructor() {
    this.#map = new Map()
    this.#notify = createNotify()
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
    const now = Date.now()
    const connUpdated = now // FIXME: not just conn
    const prevInfo = this.#map.get(address)
    if (prevInfo) {
      for (const key of Object.keys(info)) {
        const k = /**@type {keyof Info}*/ (key)
        if (typeof info[k] === 'undefined') delete info[k]
      }
      this.#map.set(address, { ...prevInfo, connUpdated, ...info })
    } else if (!info.state) {
      this.#map.set(address, { ...info, state: 'disconnected' })
    } else {
      const connBirth = now
      this.#map.set(address, {
        .../**@type {Info}*/ (info),
        connBirth,
        connUpdated,
      })
    }
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

  liveEntries() {
    return pullConcat([
      pull.values([Array.from(this.#map.entries())]),
      this.#notify.listen(),
    ])
  }
}

module.exports = Infos
