const IP = require('ip')

const Multiaddr = {
  /**
   * Converts (legacy) [multiserver](https://github.com/ssbc/multiserver-address)
   * addresses to [multiaddr](https://multiformats.io/multiaddr/) (modern).
   * @param {string} msaddr
   * @returns {`/${string}`}
   */
  fromMs(msaddr) {
    const [msTransport, msTransform] = msaddr.split('~')
    const [label1, host, port] = msTransport.split(':')

    const hostFormat = IP.isV4Format(host)
      ? 'ip4'
      : IP.isV6Format('ipv6')
      ? 'ip6'
      : 'dns'
    const transport = label1 === 'net' ? 'tcp' : label1 === 'ws' ? 'ws' : null
    if (!transport) throw new Error(`Unknown transport "${label1}"`)
    const soFar = `${hostFormat}/${host}/${transport}/${port}`

    if (msTransform) {
      const [label2, pubkey, token] = msTransform.split(':')
      if (label2 !== 'shse') throw new Error(`Unknown transform "${label2}"`)
      if (token) {
        return `/${soFar}/shse/${pubkey}.${token}`
      } else {
        return `/${soFar}/shse/${pubkey}`
      }
    } else {
      return `/${soFar}`
    }
  },

  /**
   * Converts [multiaddr](https://multiformats.io/multiaddr/) (modern) to
   * [multiserver](https://github.com/ssbc/multiserver-address) address (legacy).
   * @param {`/${string}`} multiaddr
   * @returns {string}
   */
  toMs(multiaddr) {
    if (!multiaddr.startsWith('/')) {
      // prettier-ignore
      throw new Error(`Invalid multiaddr "${multiaddr}"`)
    }
    const [, , host, transport, port, transform, cred] = multiaddr.split('/')
    const label1 =
      transport === 'tcp' ? 'net' : transport === 'ws' ? 'ws' : null
    if (!label1) throw new Error(`Unknown transport "${transport}"`)
    const soFar = `${label1}:${host}:${port}`
    if (transform) {
      // prettier-ignore
      if (transform !== 'shse') throw new Error(`Unknown transform "${transform}"`)
      const [pubkey, token] = cred.split('.')
      if (token) {
        return `${soFar}~shse:${pubkey}:${token}`
      } else {
        return `${soFar}~shse:${pubkey}`
      }
    } else {
      return soFar
    }
  },
}

module.exports = Multiaddr
