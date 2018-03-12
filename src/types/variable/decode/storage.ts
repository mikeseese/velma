import { LibSdbInterface } from "../../../interface";
import { Variable, VariableRefType } from "../variable";
import { decode as decodeValue } from "./value";
import { BN } from "bn.js";

export async function decode(variable: Variable, _interface: LibSdbInterface, address: string): Promise<string> {
    let value = "";

    if (variable.position === null) {
        value = "(storage location undefined)";
    }
    else {
        let key: Buffer = new Buffer(32);
        if (variable.refType === VariableRefType.None) {
            key[31] = variable.position;
            const content = await _interface.requestStorage(address, key);
            value = decodeValue(variable.type, new BN(content.value));
        }
        else {
            if (variable.refType === VariableRefType.Array && !variable.arrayIsDynamic) {
                let values: string[] = [];
                for (let j = 0; j < variable.arrayLength; j++) {
                    key[31] = variable.position + j;
                    const content = await _interface.requestStorage(address, key);
                    values.push(decodeValue(variable.type, new BN(content.value)));
                }
                value = JSON.stringify(values);
            }
            else {
                value = "(storage for type unsupported)";
            }
        }
    }

    return value;
}