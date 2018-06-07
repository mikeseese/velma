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

    private getSmallestPC(sourceLocations: LibSdbUtils.SourceMappingDecoder.SourceLocation[], bytecode: LibSdbTypes.ContractBytecode): number | null {
        let pc: number | null = null;

        // get smallest program count? that should hypothetically be the first instruction
        for (let k = 0; k < sourceLocations.length; k++) {
            const sourceLocation = sourceLocations[k];
            const index = LibSdbUtils.SourceMappingDecoder.toIndex(sourceLocation, bytecode.srcMap);
            if (index !== null) {
                for (const entry of bytecode.pcMap.entries()) {
                    if (entry[1].index === index) {
                        if (pc === null || entry[0] < pc) {
                            pc = entry[0];
                        }
                        break;
                    }
                }
            }
        }

        return pc;
    }

    private async createBreakpoints(bp: LibSdbTypes.Breakpoint, startPosition: number, endPosition: number, pc: number, file: LibSdbTypes.File, contract: LibSdbTypes.Contract, bpIsRuntime: boolean): Promise<void> {
        // this contract has the breakpoint in it
        if (bpIsRuntime) {
            contract.runtimeBytecode.breakpoints.set(bp.id, pc);
        }
        else {
            contract.creationBytecode.breakpoints.set(bp.id, pc);
        }

        // apply the breakpoint to existing instances of this contract
        for (let k = 0; k < contract.addresses.length; k++) {
            await this._runtime._interface.requestSendBreakpoint(bp.id, contract.addresses[k], pc, true, bpIsRuntime);
        }

        // find contracts that inherit this contract and check their sourcemaps for the breakpoint
        for (let k = 0; k < file.contracts.length; k++) {
            const childContract = file.contracts[k];

            if (childContract.inheritedContracts.indexOf(contract) >= 0) {
                // this contract inherits the contract with the breakpoint, we need to check sourcemap

                let childContractSourceMap: LibSdbUtils.SourceMappingDecoder.SourceLocation[];
                if (bpIsRuntime) {
                    childContractSourceMap = LibSdbUtils.SourceMappingDecoder.decompressAll(childContract.runtimeBytecode.srcMap);
                }
                else {
                    childContractSourceMap = LibSdbUtils.SourceMappingDecoder.decompressAll(childContract.creationBytecode.srcMap);
                }

                for (let l = 0; l < childContractSourceMap.length; l++) {
                    let childIndex: number | null = null;
                    let childPc: number | null = null;
                    const sourceLocation = childContractSourceMap[l];

                    if (!(startPosition <= sourceLocation.start && sourceLocation.start <= endPosition)) {
                        continue;
                    }

                    if (bpIsRuntime) {
                        childIndex = LibSdbUtils.SourceMappingDecoder.toIndex(sourceLocation, childContract.runtimeBytecode.srcMap);
                    }
                    else {
                        childIndex = LibSdbUtils.SourceMappingDecoder.toIndex(sourceLocation, childContract.creationBytecode.srcMap);
                    }
                    if (childIndex !== null) {
                        const pcMap = bpIsRuntime ? childContract.runtimeBytecode.pcMap : childContract.creationBytecode.pcMap;
                        for (const entry of pcMap.entries()) {
                            if (entry[1].index === childIndex) {
                                if (childPc === null || entry[0] < childPc) {
                                    childPc = entry[0];
                                }
                                break;
                            }
                        }
                    }

                    if (childPc !== null) {
                        // this contract has the breakpoint in it
                        if (bpIsRuntime) {
                            childContract.runtimeBytecode.breakpoints.set(bp.id, pc);
                        }
                        else {
                            childContract.creationBytecode.breakpoints.set(bp.id, pc);
                        }

                        // apply the breakpoint to existing instances of this contract
                        for (let m = 0; m < childContract.addresses.length; m++) {
                            await this._runtime._interface.requestSendBreakpoint(bp.id, childContract.addresses[m], childPc, true, bpIsRuntime);
                        }

                        break;
                    }
                }
            }
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

                    const creationPC = this.getSmallestPC(sourceLocations, contract.creationBytecode);
                    const runtimePC = this.getSmallestPC(sourceLocations, contract.runtimeBytecode);

                    if (creationPC !== null) {
                        await this.createBreakpoints(bp, startPosition, endPosition, creationPC, file, contract, false);
                    }
                    if (runtimePC !== null) {
                        await this.createBreakpoints(bp, startPosition, endPosition, runtimePC, file, contract, true);
                    }
                    if (creationPC !== null || runtimePC !== null) {
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
                    file.contracts[i].creationBytecode.breakpoints.delete(bp.id);
                    file.contracts[i].runtimeBytecode.breakpoints.delete(bp.id);
                }
                await this._runtime._interface.requestSendBreakpoint(bp.id, "", 0, false, true);
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
                    file.contracts[i].creationBytecode.breakpoints.delete(file.breakpoints[i].id);
                    file.contracts[i].runtimeBytecode.breakpoints.delete(file.breakpoints[i].id);
                }
                await this._runtime._interface.requestSendBreakpoint(file.breakpoints[i].id, "", 0, false, true);
            }
            file.breakpoints = [];
        }
    }
}