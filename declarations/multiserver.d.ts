declare module 'multiserver/plugins/net' {
  interface NetPlugin {
    parse(addr: string): { host: string; port: number } | undefined
  }
  function createNetPlugin(options: any): NetPlugin
  export = createNetPlugin
}
