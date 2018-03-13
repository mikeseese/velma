import { VariableValueType } from "../variable";
import { decode as decodeValue } from "./value";
import { BN } from "bn.js";

export function decode(position: number, type: VariableValueType, stack: BN[]): string {
    if (position !== null && position >= 0 && position < stack.length) {
        // stack
        return decodeValue(type, stack[position]);
    }
    else {
        return "";
    }
}