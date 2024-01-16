const Path = require('path')
const FS = require('fs')
const debug = require('debug')('ppppp:net:stats')
const atomic = require('atomic-file-rw')

/**
 * @typedef {import('./index').Multiaddr} Multiaddr
 * @typedef {import('./infos')} Infos
 * @typedef {import('statistics').Statistics} Statistics
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
   * @returns {Record<`/${string}`, any>}
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
  /** @type {NodeJS.Timeout | null} */
  #scheduledWriteTask

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
    this.#scheduledWriteTask = null

    this.#readFromDisk(this.#path, (err, fileContents) => {
      if (err) {
        this.#loadedReject(err)
        debug(`Failed to load ${Stats.FILENAME}`)
        return
      } else if (fileContents) {
        const vals = SelfHealingJSONCodec.decode(fileContents)
        for (const [multiaddr, statsInfo] of Object.entries(vals)) {
          this.#infos.update(/**@type {`/${string}`}*/ (multiaddr), {
            stats: statsInfo,
          })
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

    this.#infos.onStatsUpdated(() => {
      if (!this.#closed) this.#scheduleWrite()
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

  #cancelScheduleWrite() {
    if (this.#scheduledWriteTask) {
      clearTimeout(this.#scheduledWriteTask)
    }
  }

  #scheduleWrite() {
    if (this.#persistTimeout === 0) {
      this.#writeToDisk()
      return
    }

    this.#cancelScheduleWrite()
    this.#scheduledWriteTask = setTimeout(() => {
      this.#writeToDisk((err, _) => {
        if (err) {
          console.error(`Failed to write to disk ${Stats.FILENAME}`, err)
        }
        this.#scheduledWriteTask = null
      })
    }, this.#persistTimeout)
  }

  /**
   * @param {CB<unknown>=} cb
   * @returns {void}
   */
  #writeToDisk(cb) {
    debug(`Begun serializing and writing ${Stats.FILENAME}`)
    const record = /**@type {Record<Multiaddr, StatsInfo>}*/ ({})
    for (let [multiaddr, info] of this.#infos.entries()) {
      if (info.stats) {
        record[multiaddr] = info.stats
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
    this.#closed = true
    this.#cancelScheduleWrite()
    this.#writeToDisk()
    ;/**@type {any}*/ (this.#infos) = void 0
    debug('Closed the Stats instance')
  }

  /**
   * @returns {Promise<true>}
   */
  loaded() {
    return this.#loadedPromise
  }
}

module.exports = Stats
