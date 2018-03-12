import { Variable } from "../variable";
import { decode as decodeValue } from "./value";
import { BN } from "bn.js";

export function decode(variable: Variable, stack: BN[]): string {
    if (variable.position !== null && variable.position >= 0 && variable.position < stack.length) {
        // stack
        return decodeValue(variable.type, stack[variable.position]);
    }
    else {
        return "";
    }
}