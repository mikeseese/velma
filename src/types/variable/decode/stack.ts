import { LibSdbTypes } from "../../types";
import { decode as decodeValue } from "./value";
import { BN } from "bn.js";

export function decode(position: number, detail: LibSdbTypes.ValueDetail | LibSdbTypes.EnumDetail, stack: BN[]): string {
    if (position !== null && position >= 0 && position < stack.length) {
        // stack
        return decodeValue(detail, stack[position]);
    }
    else {
        return "";
    }
}