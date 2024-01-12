declare module 'statistics' {
  export interface Statistics {
    mean: number
    stdev: number
    count: number
    sum: number
    sqsum: number
  }
  function stats(
    x: Statistics | number | null | undefined,
    y: number
  ): Statistics
  export = stats
}
