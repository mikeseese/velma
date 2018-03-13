import { VariableValueType } from "../variable";
import { decode as decodeValue } from "./value";
import { BN } from "bn.js";

export function decode(position: number, type: VariableValueType, stack: BN[], memory: (number | null)[]): string {
    let v = "";

    if (position !== null && stack.length > position) {
        // memory
        const memoryLocation = stack[position].toNumber();
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
            v = decodeValue(type, new BN(element));
        }
    }

    return v;
}