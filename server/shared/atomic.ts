/** Domain services supply a unit of work without depending on a database driver. */
export type Atomic = <T>(operation: () => Promise<T>) => Promise<T>

export const direct: Atomic = (operation) => operation()
