import { VariableValueType } from "../variable";
import { BN } from "bn.js";

export function decode(variableType: VariableValueType, value: BN) {
    let v: string = "";
    //let num;
    switch (variableType) {
        case VariableValueType.Boolean:
            v = value.eqn(1) ? "true" : "false";
            break;
        case VariableValueType.UnsignedInteger:
            v = value.toString();
            break;
        case VariableValueType.Integer:
            v = value.fromTwos(256).toString();
            break;
        case VariableValueType.FixedPoint:
            // not supported yet in Solidity (2/21/2018) per solidity.readthedocs.io
            break;
        case VariableValueType.Address:
            v = value.toString(16);
            break;
        case VariableValueType.FixedByteArray:
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
        case VariableValueType.Enum:
            // TODO:
            break;
        case VariableValueType.Function:
            // TODO:
            break;
        case VariableValueType.None:
        default:
            v = "";
            break;
    }
    return v;
}