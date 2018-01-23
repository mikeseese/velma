
export class LibSdbBreakpoints {
    public setBreakPoint(path: string, line: number, visible: boolean = true, originalSource: boolean = true): SdbBreakpoint {
        if (!this._files.has(path)) {
            this._files.set(path, new SdbFile(path));
        }
        const file = this._files.get(path)!;

        if (originalSource) {
            // we need to modify the line number using line offsets with the original source bp's
            line = util.getNewLine(line, file.lineOffsets);
        }

        let bp = new SdbBreakpoint();
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

    private verifyAllBreakpoints(): void {
        for (const file of this._files) {
            this.verifyBreakpoints(file[0]);
        }
    }

    private verifyBreakpoints(path: string): void {
        const file = this._files.get(path);

        if (file) {
            file.breakpoints.forEach(bp => {
                // Temporarily validate each breakpoint
                bp.verified = true;
                this.sendEvent('breakpointValidated', bp);

                // TODO: real breakpoint verification
            });
        }
    }

    public clearBreakPoint(path: string, line: number): SdbBreakpoint | undefined {
        const file = this._files.get(path); // TODO: handle when file isn't in this._files

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
        const file = this._files.get(path);

        if (file) {
            file.breakpoints = [];
        }
    }
}