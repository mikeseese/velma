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
    class Variable {
        constructor() {
        }
        clone() {
            let clone = new Variable();
            clone.name = this.name;
            clone.type = this.type;
            clone.scope = this.scope.clone();
            clone.stackPosition = this.stackPosition;
            return clone;
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
            return clone;
        }
    }
    LibSdbTypes.Contract = Contract;
    class File {
        constructor(fullPath) {
            this.contracts = [];
            this.breakpoints = [];
            this.lineOffsets = new Map();
            this.lineBreaks = [];
            this.path = fullPath.substring(0, fullPath.lastIndexOf("/"));
            this.name = fullPath.substring(fullPath.lastIndexOf("/"));
        }
        fullPath() {
            return path_1.normalize(this.path + utils_1.LibSdbUtils.fileSeparator + this.name);
        }
        clone() {
            let clone = new File(this.fullPath());
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