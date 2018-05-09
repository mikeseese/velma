import { LibSdbTypes } from "../../types";
import { decode as decodeValue } from "./value";
import { BN } from "bn.js";

export function decode(stackPosition: number, memoryOffset: number, detail: LibSdbTypes.ValueDetail | LibSdbTypes.EnumDetail, stack: BN[], memory: (number | null)[]): string {
    let v = "";

    if (stackPosition !== null && stack.length > stackPosition) {
        // memory
        const memoryLocation = stack[stackPosition].toNumber() + memoryOffset;
        if (memoryLocation === undefined) {
            return "(invalid memory location)";
        }

        const memorySlice = memory.slice(memoryLocation, memoryLocation + 32); // TODO: all value types are 32 bytes? /shrug?

        const element = Array.from(memorySlice, function (byte) {
            if (byte === null) {
                return "";
            }
            else {
                return ("0" + (byte).toString(16)).slice(-2); // tslint:disable-line no-bitwise
            }
        }).join("");
        if (element) {
            v = decodeValue(detail, new BN(element, 16));
        }
    }

    return v;
}