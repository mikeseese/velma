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
const types_1 = require("./types");
const utils_1 = require("./utils/utils");
class LibSdbBreakpoints {
    constructor(runtime) {
        this._runtime = runtime;
        this._breakpointId = 1;
    }
    setBreakpoint(path, line, visible = true, originalSource = true) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this._runtime._files.has(path)) {
                this._runtime._files.set(path, new types_1.LibSdbTypes.File("/", path));
            }
            const file = this._runtime._files.get(path);
            const originalLine = line;
            if (originalSource) {
                // we need to modify the line number using line offsets with the original source bp's
                line = utils_1.LibSdbUtils.getNewLine(line, file.lineOffsets);
            }
            let bp = new types_1.LibSdbTypes.Breakpoint();
            bp.verified = false;
            bp.line = line;
            bp.id = this._breakpointId++;
            bp.visible = visible;
            bp.originalSource = originalSource;
            if (file) {
                if (file.breakpoints.indexOf(bp) === -1) {
                    file.breakpoints.push(bp);
                }
                yield this.verifyBreakpoints(path);
            }
            let bpForUI = bp.clone();
            bpForUI.line = originalLine;
            return bpForUI;
        });
    }
    verifyAllBreakpoints() {
        return __awaiter(this, void 0, void 0, function* () {
            for (const file of this._runtime._files) {
                yield this.verifyBreakpoints(file[0]);
            }
        });
    }
    verifyBreakpoints(path) {
        return __awaiter(this, void 0, void 0, function* () {
            const file = this._runtime._files.get(path);
            if (file) {
                for (let i = 0; i < file.breakpoints.length; i++) {
                    const bp = file.breakpoints[i];
                    // Temporarily validate each breakpoint
                    bp.verified = true;
                    this._runtime.sendEvent('breakpointValidated', bp);
                    // TODO: real breakpoint verification
                    const astWalker = new utils_1.LibSdbUtils.AstWalker();
                    const startPosition = bp.line === 0 ? 0 : file.lineBreaks[bp.line - 1] + 1;
                    const endPosition = file.lineBreaks[bp.line];
                    let sourceLocations = [];
                    let address = "";
                    let index = null;
                    let pc = null;
                    for (let j = 0; j < file.contracts.length; j++) {
                        const contract = file.contracts[j];
                        if (contract.address !== "") {
                            astWalker.walk(contract.ast, (node) => {
                                if (node.src) {
                                    const srcSplit = node.src.split(":");
                                    const pos = parseInt(srcSplit[0]);
                                    if (startPosition <= pos && pos <= endPosition && node.name !== "VariableDeclarationStatement" && node.name !== "VariableDeclaration") {
                                        sourceLocations.push({
                                            start: parseInt(srcSplit[0]),
                                            length: parseInt(srcSplit[1]),
                                            file: parseInt(srcSplit[2])
                                        });
                                    }
                                }
                                return true;
                            });
                            // get smallest program count? that should hypothetically be the first instruction
                            for (let k = 0; k < sourceLocations.length; k++) {
                                const sourceLocation = sourceLocations[k];
                                address = contract.address;
                                index = utils_1.LibSdbUtils.SourceMappingDecoder.toIndex(sourceLocation, contract.srcmapRuntime);
                                if (index !== null) {
                                    for (const entry of contract.pcMap.entries()) {
                                        if (entry[1] === index) {
                                            if (pc === null || entry[0] < pc) {
                                                pc = entry[0];
                                            }
                                            break;
                                        }
                                    }
                                }
                            }
                            if (pc !== null) {
                                yield this._runtime._interface.requestSendBreakpoint(bp.id, address, pc, true);
                            }
                            break;
                        }
                    }
                    ;
                }
                ;
            }
        });
    }
    clearBreakpoint(path, line) {
        return __awaiter(this, void 0, void 0, function* () {
            const file = this._runtime._files.get(path); // TODO: handle when file isn't in this._files
            if (file) {
                const index = file.breakpoints.findIndex(bp => bp.line === line);
                if (index >= 0) {
                    const bp = file.breakpoints[index];
                    yield this._runtime._interface.requestSendBreakpoint(bp.id, "", 0, false);
                    file.breakpoints.splice(index, 1);
                    return bp;
                }
            }
            return undefined;
        });
    }
    clearBreakpoints(path) {
        return __awaiter(this, void 0, void 0, function* () {
            const file = this._runtime._files.get(path);
            if (file) {
                for (let i = 0; i < file.breakpoints.length; i++) {
                    yield this._runtime._interface.requestSendBreakpoint(file.breakpoints[i].id, "", 0, false);
                }
                file.breakpoints = [];
            }
        });
    }
}
exports.LibSdbBreakpoints = LibSdbBreakpoints;
//# sourceMappingURL=breakpoints.js.map