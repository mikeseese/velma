import { readFileSync } from "fs";
import { EventEmitter } from "events";
import { Socket } from "net";
import { util, code } from "/home/mike/projects/remix/src/index"

const CircularJSON = require("circular-json");
const sourceMappingDecoder = new util.SourceMappingDecoder();
const CodeUtils = code.util;

export interface SdbBreakpoint {
  id: number;
  line: number;
  verified: boolean;
}

export class LibSdb extends EventEmitter {

  // maps from sourceFile to array of Mock breakpoints
  private _breakPoints: Map<string, SdbBreakpoint[]>;

  // since we want to send breakpoint events, we will assign an id to every event
  // so that the frontend can match events with breakpoints.
  private _breakpointId: number;

  private _socket: Socket;

  private _contracts: any[];

  private _stepData: any;

  constructor() {
    super();
    this._stepData = null;
    this._socket = new Socket();
    this._breakPoints = new Map<string, SdbBreakpoint[]>();
    this._breakpointId = 1;
  }

  private contractsChanged(data: any) {
    // addresses changed
    this._contracts = data.content;
    
    Object.keys(this._contracts).forEach((key) => {
      if(this._contracts[key].sourcePath !== null) {
        this._contracts[key].pcMap = CodeUtils.nameOpCodes(new Buffer(this._contracts[key].bytecode.substring(2), 'hex'))[1];
        const inputContents = readFileSync(this._contracts[key].sourcePath).toString();
        this._contracts[key].lineBreaks = sourceMappingDecoder.getLinebreakPositions(inputContents);
      }
    });
    
    const response = {
      "status": "ok",
      "id": data.id,
      "messageType": "response",
      "content": null
    };
    this._socket.write(CircularJSON.stringify(response));
  }

  private vmStepped(data: any) {
    // step through code
    const pc = data.content.pc;
    const address = (new Buffer(data.content.address.data)).toString("hex");
    
    if (!(address in this._contracts)) {
      console.log("address " + address + " not monitored");
      const response = {
        "status": "error",
        "id": data.id,
        "messageType": "response",
        "content": "address not monitored"
      };
      this._socket.write(CircularJSON.stringify(response));
      return;
    }

    // get line number from pc
    const index = this._contracts[address].pcMap[pc];
    const sourceLocation = sourceMappingDecoder.atIndex(index, this._contracts[address].sourceMap);
    const currentLocation = sourceMappingDecoder.convertOffsetToLineColumn(sourceLocation, this._contracts[address].lineBreaks);

    this._stepData = {
      "debuggerMessageId": data.id,
      "location": currentLocation,
      "contractAddress": address,
      "vmData": data.content
    };

    this.sendEvent("step");
  }

  private socketHandler(dataSerialized: string) {
    const data = CircularJSON.parse(dataSerialized);
    const triggerType = data.triggerType;
  
    if (triggerType === "monitoredContractsChanged") {
      this.contractsChanged(data);
    }
    else if (triggerType === "step") {
      this.vmStepped(data);
    }
  }

  /**
   * Attach to SDB hook which interfaces to the EVM
   */
  public attach(host: string, port: number, callback) {
    this._socket.connect(port, host, () => {
      callback();
    });

    this._socket.on("data", this.socketHandler.bind(this));
  }

  /**
   * Start executing the given program.
   */
  public start(stopOnEntry: boolean) {

    this.verifyAllBreakpoints();

    if (stopOnEntry) {
      // we step once
      this.step(false, 'stopOnEntry');
    } else {
      // we just start to run until we hit a breakpoint or an exception
      this.continue();
    }
  }

  /**
   * Continue execution to the end/beginning.
   */
  public continue(reverse = false) {
    this.run(reverse, undefined);
  }

  /**
   * Step to the next/previous non empty line.
   */
  public stepOver(reverse = false, event = 'stopOnStepOver') {
    this.run(reverse, event);
  }

  public stepIn(reverse = false, event = 'stopOnStepIn') {
    this.run(reverse, event);
  }
  
  public step(reverse = false, event = 'stopOnStep') {
    this.run(reverse, event);
  }
  
  public stepOut(reverse = false, event = 'stopOnStepOut') {
    this.run(reverse, event);
  }

  /**
   * Returns a fake 'stacktrace' where every 'stackframe' is a word from the current line.
   */
  public stack(startFrame: number, endFrame: number): any {

    // TODO: implement stack

    const frames = new Array<any>();
    frames.push({
      "index": 0,
      "name": "meh",
      "file": this._contracts[this._stepData.contractAddress].sourcePath,
      "line": this._stepData.location.start.line
    });
    return {
      frames: frames,
      count: 1
    };
  }

  /*
   * Set breakpoint in file with given line.
   */
  public setBreakPoint(path: string, line: number) : SdbBreakpoint {

    const bp = <SdbBreakpoint> { verified: false, line, id: this._breakpointId++ };
    let bps = this._breakPoints.get(path);
    if (!bps) {
      bps = new Array<SdbBreakpoint>();
      this._breakPoints.set(path, bps);
    }
    bps.push(bp);

    this.verifyBreakpoints(path);

    return bp;
  }

  /*
   * Clear breakpoint in file with given line.
   */
  public clearBreakPoint(path: string, line: number) : SdbBreakpoint | undefined {
    let bps = this._breakPoints.get(path);
    if (bps) {
      const index = bps.findIndex(bp => bp.line === line);
      if (index >= 0) {
        const bp = bps[index];
        bps.splice(index, 1);
        return bp;
      }
    }
    return undefined;
  }

  /*
   * Clear all breakpoints for file.
   */
  public clearBreakpoints(path: string): void {
    this._breakPoints.delete(path);
  }

  // private methods

  /**
   * Run through the file.
   * If stepEvent is specified only run a single step and emit the stepEvent.
   */
  private run(reverse = false, stepEvent?: string) : void {
    // We should be stopped currently, which is why we're calling this function
    // so we should continue on now
    this.respondToDebugHook();

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
      this.on("step", function handler(this: LibSdb) {
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

  private respondToDebugHook(content = null) {
    // don't respond if we don't actually need to
    if (this._stepData === null) {
      return;
    }

    const response = {
      "status": "ok",
      "id": this._stepData.debuggerMessageId,
      "messageType": "response",
      "content": content
    };
    this._socket.write(CircularJSON.stringify(response));
    this._stepData = null;
  }
  
  private verifyAllBreakpoints() : void {
    this._breakPoints.forEach((bps, path) => {
      this.verifyBreakpoints(path);
    })
  }

  private verifyBreakpoints(path: string) : void {
    let bps = this._breakPoints.get(path);
    if (bps) {
      bps.forEach(bp => {
        // Temporarily validate each breakpoint
        bp.verified = true;
        this.sendEvent('breakpointValidated', bp);

        // TODO: real breakpoint verification
        /*if (!bp.verified && bp.line < this._sourceLines.length) {
          const srcLine = this._sourceLines[bp.line].trim();

          // if a line is empty or starts with '+' we don't allow to set a breakpoint but move the breakpoint down
          if (srcLine.length === 0 || srcLine.indexOf('+') === 0) {
            bp.line++;
          }
          // if a line starts with '-' we don't allow to set a breakpoint but move the breakpoint up
          if (srcLine.indexOf('-') === 0) {
            bp.line--;
          }
          // don't set 'verified' to true if the line contains the word 'lazy'
          // in this case the breakpoint will be verified 'lazy' after hitting it once.
          if (srcLine.indexOf('lazy') < 0) {
            bp.verified = true;
            this.sendEvent('breakpointValidated', bp);
          }
        }*/
      });
    }
  }

  /**
   * Fire events if line has a breakpoint or the word 'exception' is found.
   * Returns true is execution needs to stop.
   */
  private fireEventsForStep(stepEvent?: string): boolean {
    if(this._stepData.location.start === null) {
      return false;
    }

    const ln = this._stepData.location.start.line;
    console.log(ln);

    // TODO: do we need to do an output event send?
    // this.sendEvent('output', matches[1], this._sourceFile, ln, matches.index)

    // TODO: figure out if an exception happened? do exceptions happen in the VM?
    /*if (line.indexOf('exception') >= 0) {
      this.sendEvent('stopOnException');
      return true;
    }*/

    // TODO: Stop on out of gas. I'd call that an exception

    // is there a breakpoint?
    const breakpoints = this._breakPoints.get(this._contracts[this._stepData.contractAddress].sourcePath);
    if (breakpoints) {
      const bps = breakpoints.filter(bp => bp.line === ln);
      if (bps.length > 0) {

        // send 'stopped' event
        this.sendEvent('stopOnBreakpoint');

        // the following shows the use of 'breakpoint' events to update properties of a breakpoint in the UI
        // if breakpoint is not yet verified, verify it now and send a 'breakpoint' update event
        if (!bps[0].verified) {
          bps[0].verified = true;
          this.sendEvent('breakpointValidated', bps[0]);
        }
        return true;
      }
    }

    // TODO: step in/step over/step out

    // nothing interesting found -> continue
    return false;
  }

  private sendEvent(event: string, ... args: any[]) {
    setImmediate(_ => {
      this.emit(event, ...args);
    });
  }
}