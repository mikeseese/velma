import { Variable, VariableValueType, VariableRefType } from "../variable";
import { decode as decodeValue } from "./value";
import { BN } from "bn.js";

export function decode(variable: Variable, stack: BN[], memory: (number | null)[]): string {
    if (variable.position !== null && stack.length > variable.position) {
        // memory
        const memoryLocation = stack[variable.position].toNumber();
        if (memoryLocation === undefined) {
            return "(invalid memory location)";
        }
        let numBytesPerElement: number = 0;
        switch (variable.type) {
            case VariableValueType.Boolean:
            case VariableValueType.UnsignedInteger:
            case VariableValueType.Integer:
            case VariableValueType.Address:
            case VariableValueType.FixedByteArray:
                numBytesPerElement = 32;
                break;
            case VariableValueType.FixedPoint:
            case VariableValueType.Enum:
            case VariableValueType.Function:
                // TODO:
                break;
            case VariableValueType.None:
            default:
                break;
        }
        if (variable.refType === VariableRefType.Array) {
            const memorySlice = memory.slice(memoryLocation, memoryLocation + numBytesPerElement * variable.arrayLength);
            let elements: string[] = [];
            for (let i = 0; i < variable.arrayLength; i++) {
                const elementSlice = memorySlice.slice(i * numBytesPerElement, i * numBytesPerElement + numBytesPerElement);
                const element = Array.from(elementSlice, function (byte) {
                    if (byte === null) {
                        return "";
                    }
                    else {
                        return ("0" + (byte).toString(16)).slice(-2); // tslint:disable-line no-bitwise
                    }
                }).join("");
                if (element) {
                    const elementValue = decodeValue(variable.type, new BN(element));
                    elements.push(elementValue);
                }
            }
            return JSON.stringify(elements);
        }
        return ""; // TODO:
    }
    else {
        return "";
    }
}