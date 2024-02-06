declare module 'pull-awaitable' {
  function awaitable<T>(pullStream: any): AsyncIterableIterator<T>
  export = awaitable
}
