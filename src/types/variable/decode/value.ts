import { VariableType } from "../variable";
import { BN } from "bn.js";

export function decode(variableType: VariableType, value: BN) {
    let v: string = "";
    //let num;
    switch (variableType) {
        case VariableType.Boolean:
            v = value.eqn(1) ? "true" : "false";
            break;
        case VariableType.UnsignedInteger:
            v = value.toString();
            break;
        case VariableType.Integer:
            v = value.fromTwos(256).toString();
            break;
        case VariableType.FixedPoint:
            // not supported yet in Solidity (2/21/2018) per solidity.readthedocs.io
            break;
        case VariableType.Address:
            v = value.toString(16);
            break;
        case VariableType.FixedByteArray:
            const byteArrayStr = value.toString(16).match(/.{2}/g);
            let byteArray: number[];
            if (byteArrayStr !== null) {
                byteArray = byteArrayStr.map((val, idx) => {
                    return parseInt(val, 16);
                });
            }
            else {
                byteArray = [];
            }
            v = JSON.stringify(byteArray);
            break;
        case VariableType.Enum:
            // TODO:
            break;
        case VariableType.Function:
            // TODO:
            break;
        case VariableType.None:
        default:
            v = "";
            break;
    }
    return v;
}