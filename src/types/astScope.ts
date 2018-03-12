
export class AstScope {
  id: number; // id provided by compiler
  childIndex: number | null; // index in parent's 'children' array, null if root node
  depth: number;

  constructor() {
  }

  clone(): AstScope {
      let clone = new AstScope();

      clone.id = this.id;

      clone.childIndex = this.childIndex;

      clone.depth = this.depth;

      return clone;
  }
}