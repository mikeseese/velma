import { LibSdbInterface } from "../../../interface";
import { VariableValueType } from "../variable";
import { decode as decodeValue } from "./value";
import { BN } from "bn.js";

export async function decode(position: number, offset: number, length: number, type: VariableValueType, _interface: LibSdbInterface, address: string): Promise<string> {
    let value = "";

    if (position === null) {
        value = "(storage location undefined)";
    }
    else {
        let key: Buffer = new Buffer(32);
        key[31] = position; // TODO: hackinahack
        const content = await _interface.requestStorage(address, key);
        value = decodeValue(type, new BN(content.value.slice(offset, length)));
    }

    return value;
}