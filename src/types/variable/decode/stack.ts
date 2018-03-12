import { Variable } from "../variable";
import { ValueDetail } from "../detail/value";
import { decode as decodeValue } from "./value";
import { BN } from "bn.js";

export function decode(variable: Variable, stack: BN[]): string {
    if (variable.position !== null && variable.position >= 0 && variable.position < stack.length && variable.detail instanceof ValueDetail) {
        // stack
        return decodeValue(variable.detail.type, stack[variable.position]);
    }
    else {
        return "";
    }
}