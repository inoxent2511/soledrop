/** Retains the smallest `limit` values without materializing or sorting the complete input. */
export class BoundedSelection<T> {
  private readonly values: T[] = []
  readonly limit: number
  private readonly compare: (left: T, right: T) => number
  constructor(limit: number, compare: (left: T, right: T) => number) {
    if (!Number.isSafeInteger(limit) || limit < 1) throw new RangeError("Invalid selection limit")
    this.limit = limit
    this.compare = compare
  }

  get size() { return this.values.length }
  get largest(): T | undefined { return this.values[0] }

  add(value: T) {
    if (this.values.length < this.limit) {
      this.values.push(value)
      let index = this.values.length - 1
      while (index > 0) {
        const parent = Math.floor((index - 1) / 2)
        if (this.compare(this.values[parent], value) >= 0) break
        this.values[index] = this.values[parent]
        index = parent
      }
      this.values[index] = value
      return
    }
    if (this.compare(value, this.values[0]) >= 0) return
    let index = 0
    while (index * 2 + 1 < this.values.length) {
      let child = index * 2 + 1
      if (child + 1 < this.values.length && this.compare(this.values[child + 1], this.values[child]) > 0) child++
      if (this.compare(value, this.values[child]) >= 0) break
      this.values[index] = this.values[child]
      index = child
    }
    this.values[index] = value
  }

  sorted(): T[] { return [...this.values].sort(this.compare) }
}
