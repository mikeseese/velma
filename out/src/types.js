"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = require("path");
const utils_1 = require("./utils/utils");
const CircularJSON = require("circular-json");
var LibSdbTypes;
(function (LibSdbTypes) {
    class StepData {
        constructor() {
            this.scope = [];
        }
        clone() {
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
    LibSdbTypes.StepData = StepData;
    class Breakpoint {
        constructor() {
        }
        clone() {
            let clone = new Breakpoint();
            clone.id = this.id;
            clone.line = this.line;
            clone.verified = this.verified;
            clone.visible = this.visible;
            clone.originalSource = this.originalSource;
            return clone;
        }
    }
    LibSdbTypes.Breakpoint = Breakpoint;
    class StackFrame {
        constructor() {
        }
        clone() {
            let clone = new StackFrame();
            clone.name = this.name;
            clone.file = this.file;
            clone.line = this.line;
            return clone;
        }
    }
    LibSdbTypes.StackFrame = StackFrame;
    class AstScope {
        constructor() {
        }
        clone() {
            let clone = new AstScope();
            clone.id = this.id;
            clone.childIndex = this.childIndex;
            clone.depth = this.depth;
            return clone;
        }
    }
    LibSdbTypes.AstScope = AstScope;
    let VariableLocation;
    (function (VariableLocation) {
        VariableLocation[VariableLocation["Stack"] = 0] = "Stack";
        VariableLocation[VariableLocation["Memory"] = 1] = "Memory";
        VariableLocation[VariableLocation["Storage"] = 2] = "Storage";
    })(VariableLocation = LibSdbTypes.VariableLocation || (LibSdbTypes.VariableLocation = {}));
    let VariableValueType;
    (function (VariableValueType) {
        VariableValueType[VariableValueType["Boolean"] = 0] = "Boolean";
        VariableValueType[VariableValueType["UnsignedInteger"] = 1] = "UnsignedInteger";
        VariableValueType[VariableValueType["Integer"] = 2] = "Integer";
        VariableValueType[VariableValueType["FixedPoint"] = 3] = "FixedPoint";
        VariableValueType[VariableValueType["Address"] = 4] = "Address";
        VariableValueType[VariableValueType["FixedByteArray"] = 5] = "FixedByteArray";
        VariableValueType[VariableValueType["Enum"] = 6] = "Enum";
        VariableValueType[VariableValueType["Function"] = 7] = "Function";
        VariableValueType[VariableValueType["None"] = 8] = "None";
    })(VariableValueType = LibSdbTypes.VariableValueType || (LibSdbTypes.VariableValueType = {}));
    let VariableRefType;
    (function (VariableRefType) {
        VariableRefType[VariableRefType["Array"] = 0] = "Array";
        VariableRefType[VariableRefType["Struct"] = 1] = "Struct";
        VariableRefType[VariableRefType["Mapping"] = 2] = "Mapping";
        VariableRefType[VariableRefType["None"] = 3] = "None";
    })(VariableRefType = LibSdbTypes.VariableRefType || (LibSdbTypes.VariableRefType = {}));
    class Variable {
        constructor() {
        }
        clone() {
            let clone = new Variable();
            clone.name = this.name;
            clone.type = this.type;
            clone.originalType = this.originalType;
            clone.refType = this.refType;
            clone.arrayIsDynamic = this.arrayIsDynamic;
            clone.arrayLength = this.arrayLength;
            clone.scope = this.scope.clone();
            clone.position = this.position;
            return clone;
        }
        typeToString() {
            return "";
        }
        valueToString(stack, memory, storage) {
            let v = "";
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
        stackValueToString(stack) {
            if (this.position !== null && stack.length > this.position) {
                // stack
                return utils_1.LibSdbUtils.interperetValue(this.type, stack[this.position]);
            }
            else {
                return "";
            }
        }
        memoryValueToString(stack, memory) {
            if (this.position !== null && stack.length > this.position) {
                // memory
                const memoryLocation = parseInt(stack[this.position], 16);
                if (memoryLocation === undefined) {
                    return "(invalid memory location)";
                }
                let numBytesPerElement = 0;
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
                    let elements = [];
                    for (let i = 0; i < this.arrayLength; i++) {
                        const elementSlice = memorySlice.slice(i * numBytesPerElement, i * numBytesPerElement + numBytesPerElement);
                        const element = Array.from(elementSlice, function (byte) {
                            if (byte === null) {
                                return "";
                            }
                            else {
                                return ("0" + (byte).toString(16)).slice(-2); // tslint:disable-line no-bitwise
                            }
                        }).join("");
                        if (element) {
                            const elementValue = utils_1.LibSdbUtils.interperetValue(this.type, element);
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
        storageValueToString() {
            // storage
            return "";
        }
    }
    LibSdbTypes.Variable = Variable;
    class ExpressionFunction {
        constructor() {
            this.args = [];
        }
        clone() {
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
    LibSdbTypes.ExpressionFunction = ExpressionFunction;
    class Evaluation {
        constructor() {
            this.returnVariable = new Variable();
        }
        clone() {
            let clone = new Evaluation();
            clone.functionName = this.functionName;
            clone.callback = this.callback;
            return clone;
        }
    }
    LibSdbTypes.Evaluation = Evaluation;
    class Contract {
        constructor() {
            this.pcMap = new Map();
            this.scopeVariableMap = new Map();
            this.functionNames = new Map();
            this.numStateVariables = 0;
        }
        clone() {
            let clone = new Contract();
            clone.name = this.name;
            clone.sourcePath = this.sourcePath;
            clone.address = this.address;
            for (const v of this.pcMap) {
                clone.pcMap.set(v[0], v[1]);
            }
            for (const variables of this.scopeVariableMap) {
                const variablesClone = new Map();
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
            clone.numStateVariables = this.numStateVariables;
            return clone;
        }
    }
    LibSdbTypes.Contract = Contract;
    class File {
        constructor(sourceRoot, relativePath) {
            this.contracts = [];
            this.breakpoints = [];
            this.lineOffsets = new Map();
            this.lineBreaks = [];
            this.sourceRoot = sourceRoot;
            this.relativeDirectory = path_1.dirname(relativePath);
            this.name = path_1.basename(relativePath);
        }
        fullPath() {
            return path_1.join(this.sourceRoot, this.relativeDirectory, this.name);
        }
        clone() {
            let clone = new File(this.sourceRoot, path_1.join(this.relativeDirectory, this.name));
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
    LibSdbTypes.File = File;
})(LibSdbTypes = exports.LibSdbTypes || (exports.LibSdbTypes = {}));
//# sourceMappingURL=types.js.map