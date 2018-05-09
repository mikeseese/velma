import { LibSdbInterface } from "../../../interface";
import { LibSdbTypes } from "../../types";
import { decode as decodeValue } from "./value";
import { BN } from "bn.js";

export async function decode(position: number, offset: number, length: number, detail: LibSdbTypes.ValueDetail | LibSdbTypes.EnumDetail, _interface: LibSdbInterface, address: string): Promise<string> {
    let value = "";

    if (position === null) {
        value = "(storage location undefined)";
    }
    else {
        let key: Buffer = new Buffer(32);
        key[31] = position; // TODO: hackinahack
        const content = await _interface.requestStorage(address, key);
        let end = content.value.length - offset;
        let start = end - length;
        if (start < 0) {
            start = 0;
        }
        if (end < 0) {
            end = 0;
        }
        value = decodeValue(detail, new BN(content.value.slice(start, end)));
    }

    return value;
}