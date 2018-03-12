import { LibSdbUtils } from "../utils/utils";
import { AstScope } from "./astScope";
import { BN } from "bn.js";

export enum VariableLocation {
  Stack,
  Memory,
  Storage
}

export enum VariableValueType {
  Boolean,
  UnsignedInteger,
  Integer,
  FixedPoint,
  Address,
  FixedByteArray,
  Enum,
  Function,
  None
}

export enum VariableRefType {
  Array,
  Struct,
  Mapping,
  None
}

export class Variable {
  name: string;
  functionName: string | null;
  type: VariableValueType;
  originalType: string;
  refType: VariableRefType;
  arrayIsDynamic: boolean; // false for non-arrays
  arrayLength: number; // 0 for non-arrays
  // TODO: struct info
  scope: AstScope;
  position: number | null;
  location: VariableLocation;

  constructor() {
  }

  clone(): Variable {
      let clone = new Variable();

      clone.name = this.name;

      clone.functionName = this.functionName;

      clone.type = this.type;

      clone.originalType = this.originalType;

      clone.refType = this.refType;

      clone.arrayIsDynamic = this.arrayIsDynamic;

      clone.arrayLength = this.arrayLength;

      clone.scope = this.scope.clone();

      clone.position = this.position;

      return clone;
  }

  typeToString(): string {
      return this.originalType;
  }

  valueToString(stack: BN[], memory: (number | null)[], storage: any): string {
      let v: string = "";
      switch (this.location) {
          case VariableLocation.Stack:
              v = this.stackValueToString(stack);
              break;
          case VariableLocation.Memory:
              v = this.memoryValueToString(stack, memory);
              break;
          case VariableLocation.Storage:
              v = this.storageValueToString();
              break;
          default:
              break;
      }
      return v;
  }

  stackValueToString(stack: BN[]): string {
      if (this.position !== null && this.position >= 0 && this.position < stack.length) {
          // stack
          return LibSdbUtils.interperetValue(this.type, stack[this.position]);
      }
      else {
          return "";
      }
  }

  memoryValueToString(stack: BN[], memory: (number | null)[]): string {
      if (this.position !== null && stack.length > this.position) {
          // memory
          const memoryLocation = stack[this.position].toNumber();
          if (memoryLocation === undefined) {
              return "(invalid memory location)";
          }
          let numBytesPerElement: number = 0;
          switch (this.type) {
              case VariableValueType.Boolean:
              case VariableValueType.UnsignedInteger:
              case VariableValueType.Integer:
              case VariableValueType.Address:
              case VariableValueType.FixedByteArray:
                  numBytesPerElement = 32;
                  break;
              case VariableValueType.FixedPoint:
              case VariableValueType.Enum:
              case VariableValueType.Function:
                  // TODO:
                  break;
              case VariableValueType.None:
              default:
                  break;
          }
          if (this.refType === VariableRefType.Array) {
              const memorySlice = memory.slice(memoryLocation, memoryLocation + numBytesPerElement * this.arrayLength);
              let elements: string[] = [];
              for (let i = 0; i < this.arrayLength; i++) {
                  const elementSlice = memorySlice.slice(i*numBytesPerElement, i*numBytesPerElement + numBytesPerElement);
                  const element = Array.from(elementSlice, function(byte) {
                      if (byte === null) {
                          return "";
                      }
                      else {
                          return ("0" + (byte).toString(16)).slice(-2); // tslint:disable-line no-bitwise
                      }
                  }).join("");
                  if (element) {
                      const elementValue = LibSdbUtils.interperetValue(this.type, new BN(element));
                      elements.push(elementValue);
                  }
              }
              return JSON.stringify(elements);
          }
          return ""; // TODO:
      }
      else {
          return "";
      }
  }

  storageValueToString(): string {
      // storage
      return "";
  }
}