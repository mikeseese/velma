import { LibSdbTypes } from "./types/types";
import { LibSdbUtils } from "./utils/utils";
import { LibSdbRuntime } from "./runtime";

export class LibSdbBreakpoints {
    private _runtime: LibSdbRuntime;

    private _breakpointId: number;

    constructor() {
        this._runtime = LibSdbRuntime.instance();
        this._breakpointId = 1;
    }

    public async setBreakpoint(path: string, line: number, visible: boolean = true, originalSource: boolean = true): Promise<LibSdbTypes.Breakpoint> {
        if (!this._runtime._files.has(path)) {
            this._runtime._files.set(path, new LibSdbTypes.File("/", path));
        }
        const file = this._runtime._files.get(path)!;
        const originalLine = line;

        if (originalSource) {
            // we need to modify the line number using line offsets with the original source bp's
            line = LibSdbUtils.getNewLine(line, file.lineOffsets);
        }

        let bp = new LibSdbTypes.Breakpoint();
        bp.verified = false;
        bp.line = line;
        bp.id = this._breakpointId++;
        bp.visible = visible;
        bp.originalSource = originalSource;

        if (file) {
            if (file.breakpoints.indexOf(bp) === -1) {
                file.breakpoints.push(bp);
            }

            await this.verifyBreakpoints(path);
        }

        let bpForUI = bp.clone();
        bpForUI.line = originalLine;

        return bpForUI;
    }

    public async verifyAllBreakpoints(): Promise<void> {
        for (const file of this._runtime._files) {
            await this.verifyBreakpoints(file[0]);
        }
    }

    public async verifyBreakpoints(path: string): Promise<void> {
        const file = this._runtime._files.get(path);

        if (file) {
            for (let i = 0; i < file.breakpoints.length; i++) {
                const bp = file.breakpoints[i];
                // Temporarily validate each breakpoint
                bp.verified = true;
                this._runtime.sendEvent('breakpointValidated', bp);

                // TODO: real breakpoint verification

                const astWalker = new LibSdbUtils.AstWalker();
                const startPosition = bp.line === 0 ? 0 : file.lineBreaks[bp.line - 1] + 1;
                const endPosition = file.lineBreaks[bp.line];
                for (let j = 0; j < file.contracts.length; j++) {
                    let sourceLocations: LibSdbUtils.SourceMappingDecoder.SourceLocation[] = [];
                    let index: number | null = null;
                    let pc: number | null = null;
                    const contract = file.contracts[j];

                    // get source locations that match the breakpoint
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
                        index = LibSdbUtils.SourceMappingDecoder.toIndex(sourceLocation, contract.srcmapRuntime);
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
                        // this contract has the breakpoint in it
                        contract.breakpoints.set(bp.id, pc);

                        // apply the breakpoint to existing instances of this contract
                        for (let k = 0; k < contract.addresses.length; k++) {
                            await this._runtime._interface.requestSendBreakpoint(bp.id, contract.addresses[k], pc, true);
                        }

                        // find contracts that inherit this contract and check their sourcemaps for the breakpoint
                        for (let k = 0; k < file.contracts.length; k++) {
                            const childContract = file.contracts[k];

                            if (childContract.inheritedContracts.indexOf(contract) >= 0) {
                                // this contract inherits the contract with the breakpoint, we need to check sourcemap

                                const childContractSourceMap = LibSdbUtils.SourceMappingDecoder.decompressAll(childContract.srcmapRuntime);

                                for (let l = 0; l < childContractSourceMap.length; l++) {
                                    let childIndex: number | null = null;
                                    let childPc: number | null = null;
                                    const sourceLocation = childContractSourceMap[l];

                                    if (!(startPosition <= sourceLocation.start && sourceLocation.start <= endPosition)) {
                                        continue;
                                    }

                                    childIndex = LibSdbUtils.SourceMappingDecoder.toIndex(sourceLocation, childContract.srcmapRuntime);
                                    if (childIndex !== null) {
                                        for (const entry of childContract.pcMap.entries()) {
                                            if (entry[1] === childIndex) {
                                                if (childPc === null || entry[0] < childPc) {
                                                    childPc = entry[0];
                                                }
                                                break;
                                            }
                                        }
                                    }

                                    if (childPc !== null) {
                                        // this contract has the breakpoint in it
                                        childContract.breakpoints.set(bp.id, pc);

                                        // apply the breakpoint to existing instances of this contract
                                        for (let m = 0; m < childContract.addresses.length; m++) {
                                            await this._runtime._interface.requestSendBreakpoint(bp.id, childContract.addresses[m], childPc, true);
                                        }

                                        break;
                                    }
                                }
                            }
                        }

                        break;
                    }
                };
            };
        }
    }

    public async clearBreakpoint(path: string, line: number): Promise<LibSdbTypes.Breakpoint | undefined> {
        const file = this._runtime._files.get(path); // TODO: handle when file isn't in this._files

        if (file) {
            const index = file.breakpoints.findIndex(bp => bp.line === line);
            if (index >= 0) {
                const bp = file.breakpoints[index];
                for (let i = 0; i < file.contracts.length; i++) {
                    file.contracts[i].breakpoints.delete(bp.id);
                }
                await this._runtime._interface.requestSendBreakpoint(bp.id, "", 0, false);
                file.breakpoints.splice(index, 1);
                return bp;
            }
        }

        return undefined;
    }

    public async clearBreakpoints(path: string): Promise<void> {
        const file = this._runtime._files.get(path);

        if (file) {
            for (let i = 0; i < file.breakpoints.length; i++) {
                for (let j = 0; j < file.contracts.length; j++) {
                    file.contracts[j].breakpoints.delete(file.breakpoints[i].id);
                }
                await this._runtime._interface.requestSendBreakpoint(file.breakpoints[i].id, "", 0, false);
            }
            file.breakpoints = [];
        }
    }
}