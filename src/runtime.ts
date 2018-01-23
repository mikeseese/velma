import { readFileSync } from "fs";
import { EventEmitter } from "events";
import { util, code } from "/home/mike/projects/remix/src/index";
import { compile } from "solc";
import { v4 as uuidv4 } from "uuid";
import { normalize as normalizePath } from "path";

import {
    SdbStepData,
    SdbBreakpoint,
    SdbStackFrame,
    SdbAstScope,
    SdbVariable,
    SdbExpressionFunction,
    SdbEvaluation,
    SdbContract,
    SdbFile,
    SdbVariableName,
    SdbVariableMap,
    SdbScopeVariableMap,
    SdbAst,
    SdbContractMap,
    SdbFileMap
} from "./types";

import {
    fileSeparator,
    GetFunctionProgramCount,
    adjustBreakpointLineNumbers,
    adjustCallstackLineNumbers
} from "./utils";

import {
    linkCompilerOutput,
    linkContractAddress
} from "./compiler";

const CircularJSON = require("circular-json");
const BigNumber = require("bignumber.js");
const traverse = require("traverse");
const parseExpression = require("/home/mike/projects/solidity-parser/index").parse;
const sourceMappingDecoder = new util.SourceMappingDecoder();

/** Parse the error message thrown with a naive compile in order to determine the actual return type. This is the hacky alternative to parsing an AST. */
const regexpReturnError = /Return argument type (.*) is not implicitly convertible to expected type \(type of first return variable\) bool./
const matchReturnTypeFromError = message => message.match(regexpReturnError);

export class LibSdbRuntime extends EventEmitter {

    // since we want to send breakpoint events, we will assign an id to every event
    // so that the frontend can match events with breakpoints.
    private _breakpointId: number;

    private _stepData: SdbStepData | null;

    private _priorStepData: SdbStepData | null;
    private _priorUiStepData: SdbStepData | null;

    private _callStack: SdbStackFrame[];
    private _priorUiCallStack: SdbStackFrame[] | null;

    private _ongoingEvaluation: SdbEvaluation | null;

    public _files: SdbFileMap;
    public _contractsByName: SdbContractMap;
    public _contractsByAddress: SdbContractMap;

    constructor() {
        super();

        this._files = new Map<string, SdbFile>();
        this._contractsByName = new Map<string, SdbContract>();
        this._contractsByAddress = new Map<string, SdbContract>();

        this._breakpointId = 1;

        this._stepData = null;
        this._priorStepData = null;
        this._priorUiStepData = null;

        this._callStack = [];
        this._priorUiCallStack = [];

        this._ongoingEvaluation = null;
    }

    private findScope(index: number, address: string): SdbAstScope[] {
        let scope: SdbAstScope[] = [];
        const ast = this._contractsByAddress.get(address)!.ast;

        const astWalker = new util.AstWalker();
        astWalker.walkDetail(ast, null, 0, (node, parent, depth) => {
            const src = node.src.split(":").map((s) => { return parseInt(s); });
            if (src.length >= 2 && src[0] <= index && index <= src[0] + src[1]) {
                let childIndex: number | null = null;
                if (parent) {
                    // look for the child in the parent to get the index
                    for (let i = 0; i < parent.children.length; i++) {
                        if (parent.children[i].id === node.id) {
                            childIndex = i;
                        }
                    }
                }
                let astScope = new SdbAstScope();
                astScope.id = node.id;
                astScope.childIndex = childIndex;
                astScope.depth = depth;
                scope.unshift(astScope);
                return true;
            }
            else {
                return false;
            }
        });

        return scope;
    }

    public vmStepped(data: any) {
        // step through code
        const pc = data.content.pc;
        const address = (new Buffer(data.content.address.data)).toString("hex");

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
            this._stepData = new SdbStepData();
            this._stepData.debuggerMessageId = data.id;
            this._stepData.source = null;
            this._stepData.location = null;
            this._stepData.contractAddress = address;
            this._stepData.vmData = data.content;
            this._stepData.scope = [];
            this.respondToDebugHook();
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
            const sourceLocation = sourceMappingDecoder.atIndex(index, contract.srcmapRuntime);
            const currentLocation = sourceMappingDecoder.convertOffsetToLineColumn(sourceLocation, file.lineBreaks);

            if (this._priorStepData && this._priorStepData.source) {
                if (this._priorStepData.source.jump === "i") {
                    // jump in

                    // push the prior function onto the stack. the current location for stack goes on when requested
                    const node = sourceMappingDecoder.findNodeAtSourceLocation("FunctionDefinition", this._priorStepData.source, { AST: contract.ast });
                    const functionName = node.attributes.name;
                    let frame = new SdbStackFrame();
                    frame.name = functionName;
                    frame.file = contract.sourcePath;
                    frame.line = this._priorStepData.location.start === null ? null : this._priorStepData.location.start.line;
                    this._callStack.unshift(frame);
                }
                else if (this._priorStepData.source.jump === "o") {
                    // jump out, we should be at a JUMPDEST currently
                    const node = sourceMappingDecoder.findNodeAtSourceLocation("FunctionDefinition", this._priorStepData.source, { AST: contract.ast });
                    if (node !== null) {
                        const functionName = node.attributes.name;
                        if (this._ongoingEvaluation !== null && this._ongoingEvaluation.functionName === functionName) {
                            // get variable at top of stack
                            // TODO: add support for multiple variable evaluations

                            const buf = new Buffer(data.content.stack[data.content.stack.length - 1].data);
                            const num = new BigNumber("0x" + buf.toString("hex"));

                            this._ongoingEvaluation.callback(num.toString());

                            this._ongoingEvaluation = null;
                        }
                    }

                    this._callStack.shift();
                }
                else if (pc in contract.functionNames) {
                    // jump in to external function
                    // this is the JUMPDEST of a function we just entered mike is cute

                    // TODO: figure this out
                    // const functionName = contract.functionNames[pc];
                    let frame = new SdbStackFrame();
                    frame.name = "external place?";
                    frame.file = contract.sourcePath;
                    frame.line = 0 //currentLocation.start === null ? null : currentLocation.start.line;
                    this._callStack.unshift(frame);
                }
            }

            // find current scope
            const currentScope = this.findScope(sourceLocation.start, address);

            // is there a variable declaration here?
            if (sourceLocation) {
                const variableDeclarationNode = sourceMappingDecoder.findNodeAtSourceLocation("VariableDeclaration", sourceLocation, { AST: contract.ast });
                if (variableDeclarationNode) {
                    const scope = variableDeclarationNode.attributes.scope;
                    const variables = contract.scopeVariableMap.get(scope);
                    if (variables) {
                        const names = variables.keys();
                        for (const name of names) {
                            if (name === variableDeclarationNode.attributes.name) {
                                variables.get(name)!.stackPosition = data.content.stack.length
                                break;
                            }
                        }
                    }
                }
            }

            this._stepData = new SdbStepData();
            this._stepData.debuggerMessageId = data.id;
            this._stepData.source = sourceLocation;
            this._stepData.location = currentLocation;
            this._stepData.contractAddress = address;
            this._stepData.vmData = data.content;
            this._stepData.scope = currentScope;

            this.sendEvent("step");
        }
    }

    /**
     * Returns a fake 'stacktrace' where every 'stackframe' is a word from the current line.
     */
    public stack(startFrame: number, endFrame: number): any {
        const frames = new Array<any>();

        if (this._stepData !== null) {
            const contract = this._contractsByAddress.get(this._stepData.contractAddress)!;
            const file = this._files.get(contract.sourcePath)!;
            const node = sourceMappingDecoder.findNodeAtSourceLocation("FunctionDefinition", this._stepData.source, { AST: contract.ast });
            const functionName = node.attributes.name;
            if (startFrame === 0 && this._stepData.location && this._stepData.location.start) {
                frames.push({
                    "index": startFrame,
                    "name": functionName,
                    "file": contract.sourcePath,
                    "line": util.getOriginalLine(this._stepData.location.start.line, file.lineOffsets)
                });
            }
        }

        for (let i = startFrame; i < Math.min(endFrame, this._callStack.length); i++) {
            frames.push({
                "index": i + 1, // offset by one due to the current line "at the top of the stack", but not in the callstack variable
                "name": this._callStack[i].name,
                "file": this._callStack[i].file,
                "line": util.getOriginalLine(this._callStack[i].line, this._files.get(this._callStack[i].file)!.lineOffsets)
            });
        }

        return {
            frames: frames,
            count: frames.length
        };
    }

    public variables(): any[] {
        let variables: any[] = [];

        if (this._stepData !== null) {
            const stack = this._stepData.vmData.stack;
            const contract = this._contractsByAddress.get(this._stepData.contractAddress)!;
            for (let i = 0; i < this._stepData.scope.length; i++) {
                const scope = this._stepData.scope[i];
                const scopeVars = contract.scopeVariableMap.get(scope.id)!;
                const names = scopeVars.keys();
                for (const name of names) {
                    const variable = scopeVars.get(name);
                    if (variable && variable.stackPosition !== null && stack.length > variable.stackPosition) {
                        const buf = new Buffer(stack[variable.stackPosition].data);
                        const num = new BigNumber("0x" + buf.toString("hex"));
                        variables.push({
                            name: name,
                            type: variable.type,
                            value: num.toString(),
                            variablesReference: 0
                        });
                    }
                }
            }
        }

        return variables;
    }

    public start(stopOnEntry: boolean) {
        this.verifyAllBreakpoints();

        if (stopOnEntry) {
            // we step once
            this.run(false, 'stopOnEntry');
        } else {
            // we just start to run until we hit a breakpoint or an exception
            this.continue();
        }
    }

    public continue(reverse = false) {
        this.run(reverse, undefined);
    }

    public stepOver(reverse = false, event = 'stopOnStepOver') {
        this.run(reverse, event);
    }

    public stepIn(reverse = false, event = 'stopOnStepIn') {
        this.run(reverse, event);
    }

    public stepOut(reverse = false, event = 'stopOnStepOut') {
        this.run(reverse, event);
    }

    private run(reverse = false, stepEvent?: string, content: any = null): void {
        this._priorUiCallStack = CircularJSON.parse(CircularJSON.stringify(this._callStack));
        this._priorUiStepData = CircularJSON.parse(CircularJSON.stringify(this._stepData));

        // We should be stopped currently, which is why we're calling this function
        // so we should continue on now
        this.respondToDebugHook(content);

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
        } else {
            this.on("step", function handler(this: LibSdbRuntime) {
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
                    this.respondToDebugHook();
                }
            });
        }
    }

    private fireEventsForStep(stepEvent?: string): boolean {
        if (this._stepData === null || this._stepData.location === null || this._stepData.location.start === null) {
            return false;
        }

        const contract = this._contractsByAddress.get(this._stepData.contractAddress)!;
        const file = this._files.get(contract.sourcePath)!;
        const ln = this._stepData.location.start.line;
        console.log(this._stepData.vmData.pc + " - " + ln + " - " + JSON.stringify(this._stepData.vmData.opcode));

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
                    const node = sourceMappingDecoder.findNodeAtSourceLocation("FunctionDefinition", this._stepData.source, { AST: contract.ast });
                    if (callDepthChange > 0 && differentLine && node === null) {
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

        // TODO: figure out if an exception happened? do exceptions happen in the VM?
        /*if (line.indexOf('exception') >= 0) {
          this.sendEvent('stopOnException');
          return true;
        }*/

        // TODO: Stop on out of gas. I'd call that an exception

        // is there a breakpoint?
        let priorLine = null;
        if (this._priorUiStepData && this._priorUiStepData.location.start) {
            priorLine = this._priorUiStepData.location.start.line;
        }

        const bps = file.breakpoints.filter(bp => bp.line === ln && (priorLine === null || ln !== priorLine));

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

    private sendEvent(event: string, ...args: any[]) {
        setImmediate(_ => {
            this.emit(event, ...args);
        });
    }
}