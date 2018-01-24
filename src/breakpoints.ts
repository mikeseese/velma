

import { LibSdbTypes } from "./types";
import { LibSdbUtils } from "./utils";
import { LibSdbRuntime } from "./runtime";

export class LibSdbBreakpoints {
    private _runtime: LibSdbRuntime;

    private _breakpointId: number;

    constructor(runtime: LibSdbRuntime) {
        this._runtime = runtime;
        this._breakpointId = 1;
    }

    public setBreakPoint(path: string, line: number, visible: boolean = true, originalSource: boolean = true): LibSdbTypes.Breakpoint {
        if (!this._runtime._files.has(path)) {
            this._runtime._files.set(path, new LibSdbTypes.File(path));
        }
        const file = this._runtime._files.get(path)!;

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

            this.verifyBreakpoints(path);
        }

        return bp;
    }

    public verifyAllBreakpoints(): void {
        for (const file of this._runtime._files) {
            this.verifyBreakpoints(file[0]);
        }
    }

    public verifyBreakpoints(path: string): void {
        const file = this._runtime._files.get(path);

        if (file) {
            file.breakpoints.forEach(bp => {
                // Temporarily validate each breakpoint
                bp.verified = true;
                this._runtime.sendEvent('breakpointValidated', bp);

                // TODO: real breakpoint verification
            });
        }
    }

    public clearBreakPoint(path: string, line: number): LibSdbTypes.Breakpoint | undefined {
        const file = this._runtime._files.get(path); // TODO: handle when file isn't in this._files

        if (file) {
            const index = file.breakpoints.findIndex(bp => bp.line === line);
            if (index >= 0) {
                const bp = file.breakpoints[index];
                file.breakpoints.splice(index, 1);
                return bp;
            }
        }

        return undefined;
    }

    public clearBreakpoints(path: string): void {
        const file = this._runtime._files.get(path);

        if (file) {
            file.breakpoints = [];
        }
    }
}