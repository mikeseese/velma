"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const types_1 = require("./types");
const utils_1 = require("./utils/utils");
class LibSdbBreakpoints {
    constructor(runtime) {
        this._runtime = runtime;
        this._breakpointId = 1;
    }
    setBreakPoint(path, line, visible = true, originalSource = true) {
        if (!this._runtime._files.has(path)) {
            this._runtime._files.set(path, new types_1.LibSdbTypes.File("/", path));
        }
        const file = this._runtime._files.get(path);
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
            this.verifyBreakpoints(path);
        }
        return bp;
    }
    verifyAllBreakpoints() {
        for (const file of this._runtime._files) {
            this.verifyBreakpoints(file[0]);
        }
    }
    verifyBreakpoints(path) {
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
    clearBreakPoint(path, line) {
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
    clearBreakpoints(path) {
        const file = this._runtime._files.get(path);
        if (file) {
            file.breakpoints = [];
        }
    }
}
exports.LibSdbBreakpoints = LibSdbBreakpoints;
//# sourceMappingURL=breakpoints.js.map