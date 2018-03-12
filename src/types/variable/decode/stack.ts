import { Variable } from "../variable";

import { LibSdbUtils } from "../../../utils/utils";
import { BN } from "bn.js";

export function decode(variable: Variable, stack: BN[]): string {
    if (variable.position !== null && variable.position >= 0 && variable.position < stack.length) {
        // stack
        return LibSdbUtils.interperetValue(variable.type, stack[variable.position]);
    }
    else {
        return "";
    }
}