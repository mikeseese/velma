import { join as joinPath, dirname, basename } from "path";
import { LibSdbUtils } from "./utils/utils";

const CircularJSON = require("circular-json");

export namespace LibSdbTypes {
    export class StepData {
        debuggerMessageId: string;
        source: any;
        location: any;
        contractAddress: string;
        vmData: any;
        scope: AstScope[];
        exception?: any;

        constructor() {
            this.scope = [];
        }

        clone(): StepData {
            let clone = new StepData();

            clone.debuggerMessageId = this.debuggerMessageId;

            clone.source = CircularJSON.parse(CircularJSON.stringify(this.source));

            clone.location = CircularJSON.parse(CircularJSON.stringify(this.location));

            clone.contractAddress = this.contractAddress;

            clone.vmData = CircularJSON.parse(CircularJSON.stringify(this.vmData));

            for (let i = 0; i < this.scope.length; i++) {
                clone.scope.push(this.scope[i].clone());
            }

            return clone;
        }
    }

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
        type: VariableValueType;
        originalType: string;
        refType: VariableRefType;
        arrayIsDynamic: boolean; // false for non-arrays
        arrayLength: number; // 0 for non-arrays
        // TODO: struct info
        scope: AstScope;
        stackPosition: number | null;
        location: VariableLocation;

        constructor() {
        }

        clone(): Variable {
            let clone = new Variable();

            clone.name = this.name;

            clone.type = this.type;

            clone.originalType = this.originalType;

            clone.refType = this.refType;

            clone.arrayIsDynamic = this.arrayIsDynamic;

            clone.arrayLength = this.arrayLength;

            clone.scope = this.scope.clone();

            clone.stackPosition = this.stackPosition;

            return clone;
        }

        typeToString(): string {
            return "";
        }

        valueToString(stack: string[], memory: (number | null)[], storage: any): string {
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

        stackValueToString(stack: string[]): string {
            if (this.stackPosition !== null && stack.length > this.stackPosition) {
                // stack
                return LibSdbUtils.interperetValue(this.type, stack[this.stackPosition]);
            }
            else {
                return "";
            }
        }

        memoryValueToString(stack: string[], memory: (number | null)[]): string {
            if (this.stackPosition !== null && stack.length > this.stackPosition) {
                // memory
                const memoryLocation = parseInt(stack[this.stackPosition], 16);
                if (memoryLocation === undefined) {
                    return "(invalid memory location)";
                }
                let numBytesPerElement: number = 0;
                switch (this.type) {
                    case LibSdbTypes.VariableValueType.Boolean:
                    case LibSdbTypes.VariableValueType.UnsignedInteger:
                    case LibSdbTypes.VariableValueType.Integer:
                    case LibSdbTypes.VariableValueType.Address:
                    case LibSdbTypes.VariableValueType.FixedByteArray:
                        numBytesPerElement = 32;
                        break;
                    case LibSdbTypes.VariableValueType.FixedPoint:
                    case LibSdbTypes.VariableValueType.Enum:
                    case LibSdbTypes.VariableValueType.Function:
                        // TODO:
                        break;
                    case LibSdbTypes.VariableValueType.None:
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
                        const elementValue = LibSdbUtils.interperetValue(this.type, element);
                        elements.push(elementValue);
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

    export class ExpressionFunction {
        name: string;
        args: Variable[];
        argsString: string;
        reference: string;
        code: string;

        constructor() {
            this.args = [];
        }

        clone(): ExpressionFunction {
            let clone = new ExpressionFunction();

            clone.name = this.name;

            for (let i = 0; i < this.args.length; i++) {
                clone.args.push(this.args[i].clone());
            }

            clone.argsString = this.argsString;

            clone.reference = this.reference;

            clone.code = this.code;

            return clone;
        }
    }

    export class Evaluation {
        functionName: string;
        returnVariable: Variable;
        callback: Function;

        constructor() {
            this.returnVariable = new Variable();
        }

        clone(): Evaluation {
            let clone = new Evaluation();

            clone.functionName = this.functionName;

            clone.callback = this.callback;

            return clone;
        }
    }

    export type VariableName = string;
    export type VariableMap = Map<VariableName, Variable>;
    export type ScopeVariableMap = Map<number, VariableMap>;

    export type Ast = any;

    export class Contract {
        name: string;
        sourcePath: string;
        address: string;
        pcMap: Map<number, number>;
        scopeVariableMap: ScopeVariableMap;
        functionNames: Map<number, string>; // key: pc, value: hash
        bytecode: string;
        runtimeBytecode: string;
        srcmapRuntime: string;
        ast: Ast;

        constructor() {
            this.pcMap = new Map<number, number>();
            this.scopeVariableMap = new Map<number, VariableMap>();
            this.functionNames = new Map<number, string>();
        }

        clone(): Contract {
            let clone = new Contract();

            clone.name = this.name;

            clone.sourcePath = this.sourcePath;

            clone.address = this.address;

            for (const v of this.pcMap) {
                clone.pcMap.set(v[0], v[1]);
            }

            for (const variables of this.scopeVariableMap) {
                const variablesClone = new Map<string, Variable>();
                for (const variable of variables[1]) {
                    variablesClone.set(variable[0], variable[1].clone());
                }
                clone.scopeVariableMap.set(variables[0], variablesClone);
            }

            for (const v of this.functionNames) {
                clone.functionNames.set(v[0], v[1]);
            }

            clone.bytecode = this.bytecode;

            clone.runtimeBytecode = this.runtimeBytecode;

            clone.srcmapRuntime = this.srcmapRuntime;

            clone.ast = CircularJSON.parse(CircularJSON.stringify(this.ast));

            return clone;
        }
    }

    export type ContractMap = Map<string, Contract>; // key is address or name

    export class File {
        public sourceRoot: string;
        public relativeDirectory: string;
        public name: string;
        public contracts: Contract[];
        public breakpoints: Breakpoint[];
        public lineOffsets: Map<number, number>; // key: line number, value: number of lines
        public ast: Ast;
        public sourceCode: string;
        public lineBreaks: number[];

        constructor(sourceRoot: string, relativePath: string) {
            this.contracts = [];
            this.breakpoints = [];
            this.lineOffsets = new Map<number, number>();
            this.lineBreaks = [];

            this.sourceRoot = sourceRoot;
            this.relativeDirectory = dirname(relativePath);
            this.name = basename(relativePath);
        }

        public fullPath() {
            return joinPath(this.sourceRoot, this.relativeDirectory, this.name);
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

            for (let i = 0; i < this.lineBreaks.length; i++) {
                clone.lineBreaks.push(this.lineBreaks[i]);
            }

            return clone;
        }
    }

    export type FileMap = Map<string, File>; // key is full path/name of file
}