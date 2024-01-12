type CB<T> = (...args: [Error] | [null, T]) => void

declare module 'atomic-file-rw' {
  export function readFile(path: string, encoding: string, cb: CB<string>): void
  export function writeFile(
    path: string,
    data: string,
    encoding: string,
    cb: CB<string>
  ): void
  export function deleteFile(path: string, cb: CB<null>): void
}
