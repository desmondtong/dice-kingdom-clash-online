/** Thrown by contract stubs until the owning change implements them (DEC-6). */
export class NotImplementedError extends Error {
  constructor(fn: string, owner = "build-game-server") {
    super(`${fn} is not implemented yet (implemented in ${owner})`);
    this.name = "NotImplementedError";
  }
}
