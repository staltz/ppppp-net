
declare module 'pull-ping' {
  function pullPing(opts: {timeout: number, serve?: boolean}): unknown;
  export = pullPing;
}