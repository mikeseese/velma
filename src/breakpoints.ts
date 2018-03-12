import { LibSdbTypes } from "./types/types";
import { LibSdbUtils } from "./utils/utils";
import { LibSdbRuntime } from "./runtime";

export class LibSdbBreakpoints {
    private _runtime: LibSdbRuntime;

    private _breakpointId: number;

    constructor(runtime: LibSdbRuntime) {
        this._runtime = runtime;
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
                let sourceLocations: any[] = [];
                let index: number | null = null;
                let pc: number | null = null;
                for (let j = 0; j < file.contracts.length; j++) {
                    const contract = file.contracts[j];
                    if (contract.addresses.length > 0) {
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
                            contract.breakpoints.set(bp.id, pc);
                            for (let k = 0; k < contract.addresses.length; k++) {
                                await this._runtime._interface.requestSendBreakpoint(bp.id, contract.addresses[k], pc, true);
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