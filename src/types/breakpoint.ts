
export class Breakpoint {
  id: number;
  line: number;
  verified: boolean;
  visible: boolean;
  originalSource: boolean;

  constructor() {
  }

  clone(): Breakpoint {
      let clone = new Breakpoint();

      clone.id = this.id;

      clone.line = this.line;

      clone.verified = this.verified;

      clone.visible = this.visible;

      clone.originalSource = this.originalSource;

      return clone;
  }
}