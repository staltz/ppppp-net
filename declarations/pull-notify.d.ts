declare module 'pull-notify' {
  interface Notify {
    (data: any): void;
    listen(): unknown;
    end(): void;
  }
  function CreateNotify(): Notify
  export = CreateNotify
}
