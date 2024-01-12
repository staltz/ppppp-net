declare module 'pull-ping' {
  type Abort = Error | boolean | null
  type EndOrError = Abort
  type SourceCallback<T> = (end: EndOrError, data?: T) => void
  type Source = (endOrError: Abort, cb: SourceCallback<T>) => void
  export interface PullPingDuplex {
    (endOrError: Abort, cb: SourceCallback<T>): void
    rtt: any
    skew: any
  }
  function pullPing(
    opts: { timeout: number; serve?: boolean },
    cb?: CallableFunction
  ): PullPingDuplex
  export = pullPing
}
