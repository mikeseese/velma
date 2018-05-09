import { BN } from "bn.js";
import { LibSdbTypes } from "../../types";

export function decode(detail: LibSdbTypes.ValueDetail | LibSdbTypes.EnumDetail, value: BN) {
    let v: string = "";
    //let num;
    switch (detail.type) {
        case LibSdbTypes.VariableType.Boolean:
            v = value.eqn(1) ? "true" : "false";
            break;
        case LibSdbTypes.VariableType.UnsignedInteger:
            v = value.toString();
            break;
        case LibSdbTypes.VariableType.Integer:
            v = value.fromTwos(256).toString();
            break;
        case LibSdbTypes.VariableType.FixedPoint:
            // not supported yet in Solidity (2/21/2018) per solidity.readthedocs.io
            break;
        case LibSdbTypes.VariableType.Address:
            v = "0x" + value.toString(16);
            break;
        case LibSdbTypes.VariableType.FixedByteArray:
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
        case LibSdbTypes.VariableType.Enum:
            if (detail instanceof LibSdbTypes.EnumDetail) {
                // really should be the case all the time
                const index = Math.floor(value.toNumber());
                if (index < detail.definition.values.length) {
                    v = detail.definition.values[index];
                }
                else {
                    v = "(invalid enum value) " + value.toString();
                }
            }
            break;
        case LibSdbTypes.VariableType.Function:
            // TODO:
            break;
        case LibSdbTypes.VariableType.None:
        default:
            v = "";
            break;
    }
    return v;
}