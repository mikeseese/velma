import { Contract } from "./contract";
import { Breakpoint } from "./breakpoint";
import { Ast } from "./misc";

import { join as joinPath, dirname, basename } from "path";

const CircularJSON = require("circular-json");

export class File {
  public sourceRoot: string;
  public relativeDirectory: string;
  public name: string;
  public contracts: Contract[];
  public breakpoints: Breakpoint[];
  public lineOffsets: Map<number, number>; // key: line number, value: number of lines
  public ast: Ast;
  public sourceCode: string;
  public sourceCodeOriginal: string;
  public lineBreaks: number[];
  public sourceId: number | null;

  constructor(sourceRoot: string, relativePath: string) {
      this.contracts = [];
      this.breakpoints = [];
      this.lineOffsets = new Map<number, number>();
      this.lineBreaks = [];
      this.sourceId = null;

      this.sourceRoot = sourceRoot;
      this.relativeDirectory = dirname(relativePath);
      this.name = basename(relativePath);
  }

  public fullPath() {
      return joinPath(this.sourceRoot, this.relativeDirectory, this.name);
  }

  public relativePath() {
      return joinPath(this.relativeDirectory, this.name);
  }

  clone(): File {
      let clone = new File(this.sourceRoot, joinPath(this.relativeDirectory, this.name));

      for (let i = 0; i < this.contracts.length; i++) {
          clone.contracts.push(this.contracts[i].clone());
      }

      for (let i = 0; i < this.breakpoints.length; i++) {
          clone.breakpoints.push(this.breakpoints[i].clone());
      }

      for (const lineOffset of this.lineOffsets) {
          clone.lineOffsets.set(lineOffset[0], lineOffset[1]);
      }

      clone.ast = CircularJSON.parse(CircularJSON.stringify(this.ast));

      clone.sourceCode = this.sourceCode;

      clone.sourceCodeOriginal = this.sourceCodeOriginal;

      for (let i = 0; i < this.lineBreaks.length; i++) {
          clone.lineBreaks.push(this.lineBreaks[i]);
      }

      clone.sourceId = this.sourceId;

      return clone;
  }
}