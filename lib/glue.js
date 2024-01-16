const pull = require('pull-stream')
const stats = require('statistics')
const ping = require('pull-ping')

/**
 * @typedef {import('./index').Multiaddr} Multiaddr
 * @typedef {import('./index').RPC} RPC
 * @typedef {import('./index').Peer} Peer
 * @typedef {import('./connections')} Connections
 * @typedef {import('./connections').ConnectionEvent} Event
 * @typedef {import('./infos')} Infos
 */

const PROGRAM_STARTUP = Date.now()

/**
 * @param {Infos} infos
 * @param {Connections} connections
 */
function glue(infos, connections) {
  /**
   * @param {Multiaddr} multiaddr
   * @param {RPC} rpc
   */
  function setupPing(multiaddr, rpc) {
    const PING_TIMEOUT = 5 * 6e4 // 5 minutes
    const pp = ping({ serve: true, timeout: PING_TIMEOUT }, () => {})
    infos.updateStats(multiaddr, () => ({
      ping: {
        rtt: pp.rtt,
        skew: pp.skew,
      },
    }))
    pull(
      pp,
      rpc.net.ping({ timeout: PING_TIMEOUT }, (err, _) => {
        console.warn('remote peer ping err', err)
        // if (err?.name === 'TypeError') {
        // infos.update(multiaddr, {stats: {ping: {fail: true}}});
        // }
      }),
      pp
    )
  }

  /**
   * @param {Event} ev
   */
  function onConnectingFailed(ev) {
    infos.updateStats(ev.multiaddr, (prevStats) => ({
      failure: (prevStats?.failure ?? 0) + 1,
      stateChange: Date.now(),
      duration: stats(prevStats?.duration, 0),
    }))
  }

  /**
   * @param {Event} ev
   */
  function onConnected(ev) {
    infos.updateStats(ev.multiaddr, () => ({
      stateChange: Date.now(),
      failure: 0,
    }))
    if (ev.details.weAreClient) setupPing(ev.multiaddr, ev.details.rpc)
  }

  /**
   * @param {Event} ev
   */
  function bumpStateChange(ev) {
    infos.updateStats(ev.multiaddr, () => ({
      stateChange: Date.now(),
    }))
  }

  /**
   * @param {Event} ev
   */
  function onDisconnected(ev) {
    infos.updateStats(ev.multiaddr, (prevStats) => ({
      stateChange: Date.now(),
      duration: stats(
        prevStats?.duration,
        Date.now() - (prevStats?.stateChange ?? PROGRAM_STARTUP)
      ),
    }))
  }

  pull(
    connections.listen(),
    pull.drain((ev) => {
      switch (ev.type) {
        case 'connecting':
        case 'disconnecting':
          bumpStateChange(ev)
          break
        case 'connecting-failed':
          onConnectingFailed(ev)
          break
        case 'connected':
          onConnected(ev)
          break
        case 'disconnected':
          onDisconnected(ev)
          break
        default:
          throw new Error('Unknown connection event type: ' + ev.type)
      }
    })
  )
}

module.exports = glue
