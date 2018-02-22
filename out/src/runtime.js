"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const events_1 = require("events");
const types_1 = require("./types");
const utils_1 = require("./utils/utils");
const interface_1 = require("./interface");
const breakpoints_1 = require("./breakpoints");
const evaluator_1 = require("./evaluator");
const CircularJSON = require("circular-json");
class LibSdbRuntime extends events_1.EventEmitter {
    constructor() {
        super();
        this._interface = new interface_1.LibSdbInterface(this);
        this._breakpoints = new breakpoints_1.LibSdbBreakpoints(this);
        this._evaluator = new evaluator_1.LibSdbEvaluator(this);
        this._files = new Map();
        this._contractsByName = new Map();
        this._contractsByAddress = new Map();
        this._stepData = null;
        this._priorStepData = null;
        this._priorUiStepData = null;
        this._callStack = [];
        this._priorUiCallStack = [];
        this._ongoingEvaluation = null;
    }
    respondToDebugHook(stepEvent, content = null) {
        // don't respond if we don't actually need to
        if (this._stepData === null) {
            return;
        }
        this._priorStepData = CircularJSON.parse(CircularJSON.stringify(this._stepData));
        this._interface.respondToDebugHook(stepEvent, this._stepData.debuggerMessageId, content);
        this._stepData = null;
    }
    vmStepped(data) {
        // step through code
        const pc = data.content.pc;
        const address = (new Buffer(data.content.address.data)).toString("hex").toLowerCase();
        /*if (!(address in this._contracts)) {
          console.log("address " + address + " not monitored");
          const response = {
            "status": "error",
            "id": data.id,
            "messageType": "response",
            "content": "address not monitored"
          };
          this._socket.write(CircularJSON.stringify(response));
          return;
        }*/
        if (this._contractsByAddress.get(address) === undefined) {
            this._stepData = new types_1.LibSdbTypes.StepData();
            this._stepData.debuggerMessageId = data.id;
            this._stepData.source = null;
            this._stepData.location = null;
            this._stepData.contractAddress = address;
            this._stepData.vmData = data.content;
            this._stepData.scope = [];
            this.respondToDebugHook("");
        }
        else {
            const contract = this._contractsByAddress.get(address);
            if (!contract) {
                // TODO: EEK HELP
                console.error("OIDJFOIJS fixme");
                return;
            }
            const file = this._files.get(contract.sourcePath);
            if (!file) {
                // TODO: EEK HELP
                console.error("OIDJFOIJS fixme");
                return;
            }
            // get line number from pc
            const index = contract.pcMap.get(pc);
            if (index === undefined) {
                //
            }
            const sourceLocation = utils_1.LibSdbUtils.SourceMappingDecoder.atIndex(index, contract.srcmapRuntime);
            const currentLocation = utils_1.LibSdbUtils.SourceMappingDecoder.convertOffsetToLineColumn(sourceLocation, file.lineBreaks);
            if (this._priorStepData && this._priorStepData.source) {
                if (this._priorStepData.source.jump === "i") {
                    // jump in
                    // push the prior function onto the stack. the current location for stack goes on when requested
                    const node = utils_1.LibSdbUtils.SourceMappingDecoder.findNodeAtSourceLocation("FunctionDefinition", this._priorStepData.source, { AST: contract.ast });
                    const functionName = node === null ? "(anonymous function)" : node.attributes.name;
                    let frame = new types_1.LibSdbTypes.StackFrame();
                    frame.name = functionName;
                    frame.file = contract.sourcePath;
                    frame.line = this._priorStepData.location.start === null ? null : this._priorStepData.location.start.line;
                    this._callStack.unshift(frame);
                }
                else if (this._priorStepData.source.jump === "o") {
                    // jump out, we should be at a JUMPDEST currently
                    const node = utils_1.LibSdbUtils.SourceMappingDecoder.findNodeAtSourceLocation("FunctionDefinition", this._priorStepData.source, { AST: contract.ast });
                    if (node !== null) {
                        const functionName = node.attributes.name;
                        if (this._ongoingEvaluation !== null && this._ongoingEvaluation.functionName === functionName) {
                            // get variable at top of stack
                            // TODO: add support for multiple variable evaluations
                            this._ongoingEvaluation.returnVariable.position = data.content.stack.length - 1;
                            const returnString = this._ongoingEvaluation.returnVariable.valueToString(data.content.stack, data.content.memory, {});
                            this._ongoingEvaluation.callback(returnString); // TODO: storage
                            this._ongoingEvaluation = null;
                        }
                    }
                    this._callStack.shift();
                }
                else if (pc in contract.functionNames) {
                    // jump in to external function
                    // this is the JUMPDEST of a function we just entered
                    // TODO: figure this out
                    // const functionName = contract.functionNames[pc];
                    let frame = new types_1.LibSdbTypes.StackFrame();
                    frame.name = "external place?";
                    frame.file = contract.sourcePath;
                    frame.line = 0; //currentLocation.start === null ? null : currentLocation.start.line;
                    this._callStack.unshift(frame);
                }
            }
            // find current scope
            const currentScope = utils_1.LibSdbUtils.findScope(sourceLocation.start, contract.ast);
            // is there a variable declaration here?
            if (sourceLocation) {
                const variableDeclarationNode = utils_1.LibSdbUtils.SourceMappingDecoder.findNodeAtSourceLocation("VariableDeclaration", sourceLocation, { AST: contract.ast });
                if (variableDeclarationNode) {
                    const scope = variableDeclarationNode.attributes.scope;
                    const variables = contract.scopeVariableMap.get(scope);
                    if (variables) {
                        const names = variables.keys();
                        for (const name of names) {
                            if (name === variableDeclarationNode.attributes.name) {
                                let variable = variables.get(name);
                                if (variable.location === types_1.LibSdbTypes.VariableLocation.Stack) {
                                    variable.position = data.content.stack.length;
                                }
                                else if (variable.location === types_1.LibSdbTypes.VariableLocation.Memory) {
                                    variable.position = data.content.stack.length - 1; // must prepend it onto the stack for memory
                                }
                                if (variable.location === types_1.LibSdbTypes.VariableLocation.Storage) {
                                    variable.position = data.content.stack.length;
                                }
                                break;
                            }
                        }
                    }
                }
            }
            this._stepData = new types_1.LibSdbTypes.StepData();
            this._stepData.debuggerMessageId = data.id;
            this._stepData.source = sourceLocation;
            this._stepData.location = currentLocation;
            this._stepData.contractAddress = address;
            this._stepData.vmData = data.content;
            this._stepData.scope = currentScope;
            if (data.exceptionError !== undefined) {
                this._stepData.exception = data.exceptionError;
            }
            this.sendEvent("step");
        }
    }
    stack(startFrame, endFrame) {
        const frames = new Array();
        if (this._stepData !== null) {
            const contract = this._contractsByAddress.get(this._stepData.contractAddress);
            const file = this._files.get(contract.sourcePath);
            const node = utils_1.LibSdbUtils.SourceMappingDecoder.findNodeAtSourceLocation("FunctionDefinition", this._stepData.source, { AST: contract.ast });
            const functionName = node.attributes.name;
            if (startFrame === 0 && this._stepData.location && this._stepData.location.start) {
                frames.push({
                    "index": startFrame,
                    "name": functionName,
                    "file": contract.sourcePath,
                    "line": utils_1.LibSdbUtils.getOriginalLine(this._stepData.location.start.line, file.lineOffsets)
                });
            }
        }
        for (let i = startFrame; i < Math.min(endFrame, this._callStack.length); i++) {
            frames.push({
                "index": i + 1,
                "name": this._callStack[i].name,
                "file": this._callStack[i].file,
                "line": utils_1.LibSdbUtils.getOriginalLine(this._callStack[i].line, this._files.get(this._callStack[i].file).lineOffsets)
            });
        }
        return {
            frames: frames,
            count: frames.length
        };
    }
    variables() {
        return __awaiter(this, void 0, void 0, function* () {
            let variables = [];
            if (this._stepData !== null) {
                const stack = this._stepData.vmData.stack;
                const memory = this._stepData.vmData.memory;
                const storage = {}; // TODO:
                const contract = this._contractsByAddress.get(this._stepData.contractAddress);
                for (let i = 0; i < this._stepData.scope.length; i++) {
                    const scope = this._stepData.scope[i];
                    const scopeVars = contract.scopeVariableMap.get(scope.id);
                    const names = scopeVars.keys();
                    for (const name of names) {
                        const variable = scopeVars.get(name);
                        if (variable) {
                            // TODO: more advanced array display
                            let value = "";
                            if (variable.location === types_1.LibSdbTypes.VariableLocation.Storage) {
                                if (variable.position === null) {
                                    value = "(storage location undefined)";
                                }
                                else {
                                    let key = new Buffer(32);
                                    if (variable.refType === types_1.LibSdbTypes.VariableRefType.None) {
                                        key[31] = variable.position;
                                        const content = yield this._interface.requestStorage(this._stepData.contractAddress, key);
                                        value = utils_1.LibSdbUtils.interperetValue(variable.type, new Buffer(content.value.data).toString("hex"));
                                    }
                                    else {
                                        if (variable.refType === types_1.LibSdbTypes.VariableRefType.Array && !variable.arrayIsDynamic) {
                                            let values = [];
                                            for (let j = 0; j < variable.arrayLength; j++) {
                                                key[31] = variable.position + j;
                                                const content = yield this._interface.requestStorage(this._stepData.contractAddress, key);
                                                values.push(utils_1.LibSdbUtils.interperetValue(variable.type, new Buffer(content.value.data).toString("hex")));
                                            }
                                            value = JSON.stringify(values);
                                        }
                                        else {
                                            value = "(storage for type unsupported)";
                                        }
                                    }
                                }
                            }
                            else {
                                value = variable.valueToString(stack, memory, storage);
                            }
                            variables.push({
                                name: name,
                                type: variable.typeToString(),
                                value: value,
                                variablesReference: 0
                            });
                        }
                    }
                }
            }
            return variables;
        });
    }
    start(stopOnEntry) {
        this._breakpoints.verifyAllBreakpoints();
        if (stopOnEntry) {
            // we step once
            this.run(false, 'stopOnEntry');
        }
        else {
            // we just start to run until we hit a breakpoint or an exception
            this.continue();
        }
    }
    continue(reverse = false, event = "stopOnBreakpoint") {
        this.run(reverse, event);
    }
    stepOver(reverse = false, event = 'stopOnStepOver') {
        this.run(reverse, event);
    }
    stepIn(reverse = false, event = 'stopOnStepIn') {
        this.run(reverse, event);
    }
    stepOut(reverse = false, event = 'stopOnStepOut') {
        this.run(reverse, event);
    }
    run(reverse = false, stepEvent, content = null) {
        this._priorUiCallStack = CircularJSON.parse(CircularJSON.stringify(this._callStack));
        this._priorUiStepData = CircularJSON.parse(CircularJSON.stringify(this._stepData));
        // We should be stopped currently, which is why we're calling this function
        // so we should continue on now
        if (stepEvent !== "stopOnEvalBreakpoint") {
            this.respondToDebugHook(stepEvent, content);
        }
        if (reverse) {
            // TODO: implement reverse running
            /*for (let ln = this._currentLine-1; ln >= 0; ln--) {
              if (this.fireEventsForLine(ln, stepEvent)) {
                this._currentLine = ln;
                return;
              }
            }
            // no more lines: stop at first line
            this._currentLine = 0;
            this.sendEvent('stopOnEntry');*/
        }
        else {
            this.on("step", function handler() {
                if (this.fireEventsForStep(stepEvent)) {
                    // we've stopped for some reason. let's not continue
                    this.removeListener("step", handler);
                    // TODO: handle end of evm?
                    /*if (this.) {
                      // we've finished the evm
                      this.sendEvent("end");
                    }*/
                }
                else {
                    // this is not the step we're looking for; move along
                    this.respondToDebugHook(stepEvent);
                }
            });
        }
    }
    fireEventsForStep(stepEvent) {
        if (this._stepData === null || this._stepData.location === null || this._stepData.location.start === null) {
            return false;
        }
        const contract = this._contractsByAddress.get(this._stepData.contractAddress);
        const file = this._files.get(contract.sourcePath);
        const ln = this._stepData.location.start.line;
        if (this._stepData.exception !== undefined) {
            this.sendEvent("stopOnException");
            return true;
        }
        if (this._priorUiCallStack && this._priorUiStepData) {
            const callDepthChange = this._callStack.length - this._priorUiCallStack.length;
            const differentLine = ln !== this._priorUiStepData.location.start.line;
            switch (stepEvent) {
                case "stopOnStepOver":
                    if (callDepthChange === 0 && differentLine) {
                        this.sendEvent("stopOnStepOver");
                        return true;
                    }
                    break;
                case "stopOnStepIn":
                    const node = utils_1.LibSdbUtils.SourceMappingDecoder.findNodeAtSourceLocation("FunctionDefinition", this._stepData.source, { AST: contract.ast });
                    if (callDepthChange > 0 && differentLine && node !== null) {
                        this.sendEvent("stopOnStepIn");
                        return true;
                    }
                    break;
                case "stopOnStepOut":
                    if (callDepthChange < 0 && differentLine) {
                        this.sendEvent("stopOnStepOut");
                        return true;
                    }
                    break;
                default:
                    break;
            }
        }
        // is there a breakpoint?
        let priorLine = null;
        if (this._priorUiStepData && this._priorUiStepData.location.start) {
            priorLine = this._priorUiStepData.location.start.line;
        }
        const bps = file.breakpoints.filter(bp => bp.line === ln && (priorLine === null || ln !== priorLine) && ((bp.visible && stepEvent !== "stopOnEvalBreakpoint") || (!bp.visible && stepEvent === "stopOnEvalBreakpoint")));
        if (bps.length > 0) {
            // send 'stopped' event
            this.sendEvent('stopOnBreakpoint');
            // the following shows the use of 'breakpoint' events to update properties of a breakpoint in the UI
            // if breakpoint is not yet verified, verify it now and send a 'breakpoint' update event
            if (!bps[0].verified) {
                bps[0].verified = true;
                this.sendEvent('breakpointValidated', bps[0]);
            }
            // halt execution since we just hit a breakpoint
            return true;
        }
        // nothing interesting found -> continue
        return false;
    }
    sendEvent(event, ...args) {
        setImmediate(_ => {
            this.emit(event, ...args);
        });
    }
}
exports.LibSdbRuntime = LibSdbRuntime;
//# sourceMappingURL=runtime.js.map