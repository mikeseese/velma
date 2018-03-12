
export class StackFrame {
  name: string;
  file: string;
  line: number;

  constructor() {
  }

  clone(): StackFrame {
      let clone = new StackFrame();

      clone.name = this.name;

      clone.file = this.file;

      clone.line = this.line;

      return clone;
  }
}