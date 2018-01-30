import { EventEmitter } from "events";
import { util } from "/home/mike/projects/remix/src/index";

import { LibSdbTypes } from "./types";
import { LibSdbUtils } from "./utils";
import { LibSdbInterface } from "./interface";
import { LibSdbBreakpoints } from "./breakpoints";
import { LibSdbEvaluator } from "./evaluator";

const CircularJSON = require("circular-json");
const BigNumber = require("bignumber.js");
const sourceMappingDecoder = new util.SourceMappingDecoder();

export class LibSdbRuntime extends EventEmitter {

    public _stepData: LibSdbTypes.StepData | null;

    public _priorStepData: LibSdbTypes.StepData | null;
    public _priorUiStepData: LibSdbTypes.StepData | null;

    public _callStack: LibSdbTypes.StackFrame[];
    public _priorUiCallStack: LibSdbTypes.StackFrame[] | null;

    public _ongoingEvaluation: LibSdbTypes.Evaluation | null;

    public _files: LibSdbTypes.FileMap;
    public _contractsByName: LibSdbTypes.ContractMap;
    public _contractsByAddress: LibSdbTypes.ContractMap;

    public _interface: LibSdbInterface;
    public _breakpoints: LibSdbBreakpoints;
    public _evaluator: LibSdbEvaluator;

    constructor() {
        super();

        this._interface = new LibSdbInterface(this);
        this._breakpoints = new LibSdbBreakpoints(this);
        this._evaluator = new LibSdbEvaluator(this);

        this._files = new Map<string, LibSdbTypes.File>();
        this._contractsByName = new Map<string, LibSdbTypes.Contract>();
        this._contractsByAddress = new Map<string, LibSdbTypes.Contract>();

        this._stepData = null;
        this._priorStepData = null;
        this._priorUiStepData = null;

        this._callStack = [];
        this._priorUiCallStack = [];

        this._ongoingEvaluation = null;
    }

    private respondToDebugHook(content: any = null) {
        // don't respond if we don't actually need to
        if (this._stepData === null) {
            return;
        }

        this._priorStepData = CircularJSON.parse(CircularJSON.stringify(this._stepData));

        this._interface.respondToDebugHook(this._stepData.debuggerMessageId, content);

        this._stepData = null;
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
            this._stepData = new LibSdbTypes.StepData();
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
                    let frame = new LibSdbTypes.StackFrame();
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
                    // this is the JUMPDEST of a function we just entered

                    // TODO: figure this out
                    // const functionName = contract.functionNames[pc];
                    let frame = new LibSdbTypes.StackFrame();
                    frame.name = "external place?";
                    frame.file = contract.sourcePath;
                    frame.line = 0 //currentLocation.start === null ? null : currentLocation.start.line;
                    this._callStack.unshift(frame);
                }
            }

            // find current scope
            const currentScope = LibSdbUtils.findScope(sourceLocation.start, contract.ast);

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

            this._stepData = new LibSdbTypes.StepData();
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
                    "line": LibSdbUtils.getOriginalLine(this._stepData.location.start.line, file.lineOffsets)
                });
            }
        }

        for (let i = startFrame; i < Math.min(endFrame, this._callStack.length); i++) {
            frames.push({
                "index": i + 1, // offset by one due to the current line "at the top of the stack", but not in the callstack variable
                "name": this._callStack[i].name,
                "file": this._callStack[i].file,
                "line": LibSdbUtils.getOriginalLine(this._callStack[i].line, this._files.get(this._callStack[i].file)!.lineOffsets)
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
        this._breakpoints.verifyAllBreakpoints();

        if (stopOnEntry) {
            // we step once
            this.run(false, 'stopOnEntry');
        } else {
            // we just start to run until we hit a breakpoint or an exception
            this.continue();
        }
    }

    public continue(reverse = false, content: any = null, event: string | undefined = undefined) {
        this.run(reverse, event, content);
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
                    const node = sourceMappingDecoder.findNodeAtSourceLocation("FunctionDefinition", this._stepData.source, { AST: contract.ast });
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

    public sendEvent(event: string, ...args: any[]) {
        setImmediate(_ => {
            this.emit(event, ...args);
        });
    }
}