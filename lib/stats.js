const Path = require('path')
const FS = require('fs')
const debug = require('debug')('ppppp:net:stats')
const atomic = require('atomic-file-rw')

/**
 * @typedef {import('./index').Address} Address
 * @typedef {import('./infos')} Infos
 * @typedef {{
 *   mean: number;
 *   stdev: number;
 *   count: number;
 *   sum: number;
 *   sqsum: number;
 * }} Statistics
 * @typedef {{
 *   birth?: number;
 *   key?: string;
 *   source?: string;
 *   failure?: number;
 *   stateChange?: number;
 *   duration?: Statistics;
 *   ping?: {
 *     rtt: Statistics;
 *     skew: Statistics;
 *   };
 *   [name: string]: any;
 * }} StatsInfo
 */

/**
 * @template T
 * @typedef {import('./index').CB<T>} CB
 */

/**
 * Automatically heal from corruption .json files.
 *
 * - Remove (some) extraneous characters from the end of the file
 * - If nothing works, return empty object instead of crashing
 */
const SelfHealingJSONCodec = {
  /**
   * @param {any} obj
   */
  encode(obj) {
    return JSON.stringify(obj, null, 2)
  },
  /**
   * @param {any} input
   * @returns {Record<string, any>}
   */
  decode(input) {
    if (!input) return {}
    const str = /**@type {string}*/ (input.toString())
    const MAX_TRIM = 10
    let foundCorruption = false
    for (let i = 0; i < MAX_TRIM; i++) {
      try {
        return JSON.parse(str.substring(0, str.length - i))
      } catch (err) {
        if (!foundCorruption) {
          foundCorruption = true
          // prettier-ignore
          console.warn(`WARNING: ppppp-net found a corrupted ${Stats.FILENAME} file and is attempting to heal it`)
        }
        continue
      }
    }
    console.error(
      `ERROR! ppppp-net failed to heal corrupted ${Stats.FILENAME} file`
    )
    return {}
  },
}

class Stats {
  /** @type {string} */
  #path
  /** @type {number} */
  #persistTimeout
  /** @type {boolean} */
  #closed
  /** @type {Infos} */
  #infos
  /** @type {Promise<true>} */
  #loadedPromise
  /** @type {(value: true) => void} */
  // @ts-ignore
  #loadedResolve
  /** @type {(reason: any) => void} */
  // @ts-ignore
  #loadedReject

  static FILENAME = 'stats.json'
  static DEFAULT_PERSIST_TIMEOUT = 2000

  /**
   * @param {string} dir
   * @param {Infos} infos
   * @param {number | undefined} persistTimeout
   */
  constructor(dir, infos, persistTimeout) {
    this.#path = Path.join(dir, Stats.FILENAME)
    this.#persistTimeout = persistTimeout ?? Stats.DEFAULT_PERSIST_TIMEOUT
    this.#closed = false
    this.#infos = infos
    this.#loadedPromise = new Promise((resolve, reject) => {
      this.#loadedResolve = resolve
      this.#loadedReject = reject
    })

    this.#readFromDisk(this.#path, (err, fileContents) => {
      if (err) {
        this.#loadedReject(err)
        debug(`Failed to load ${Stats.FILENAME}`)
        return
      } else if (fileContents) {
        const vals = SelfHealingJSONCodec.decode(fileContents)
        for (const [address, statsInfo] of Object.entries(vals)) {
          this.#infos.update(address, { stats: statsInfo })
        }
        this.#loadedResolve(true)
        debug('Loaded conn.json into ConnDB in memory')
      } else {
        atomic.writeFile(this.#path, '{}', 'utf8', () => {})
        this.#loadedResolve(true)
        // prettier-ignore
        debug(`Created new ${Stats.FILENAME} because there was no existing one.`);
        return
      }
    })
  }

  /**
   * @param {string} path
   * @param {CB<string | null>} cb
   */
  #readFromDisk(path, cb) {
    if (typeof localStorage !== 'undefined' && localStorage !== null) {
      // In a browser
      atomic.readFile(path, 'utf8', cb)
    } else {
      // In Node.js
      if (FS.existsSync(path)) {
        atomic.readFile(path, 'utf8', cb)
      } else {
        cb(null, null)
      }
    }
  }

  /**
   * @param {CB<unknown>=} cb
   * @returns {void}
   */
  #writeToDisk(cb) {
    if (this.#infos.size() === 0) return
    debug(`Begun serializing and writing ${Stats.FILENAME}`)
    const record = /**@type {Record<Address, StatsInfo>}*/ ({})
    for (let [address, info] of this.#infos.entries()) {
      if (info.stats) {
        record[address] = info.stats
      }
    }
    const json = SelfHealingJSONCodec.encode(record)
    atomic.writeFile(this.#path, json, 'utf8', (err, x) => {
      if (!err) debug(`Done serializing and writing ${Stats.FILENAME}`)
      if (err) return cb?.(err)
      cb?.(null, null)
    })
  }

  close() {
    this.#closed = true;
    // FIXME: implement
    // this._cancelScheduleWrite();
    // this._write();
    // this._map?.clear();
    // (this as any)._map = void 0;
    // (this as any)._notify = void 0;
    // (this as any)._stateFile = void 0;
    debug('Closed the Stats instance');
  }

  /**
   * @returns {Promise<true>}
   */
  loaded() {
    return this.#loadedPromise
  }
}

module.exports = Stats
