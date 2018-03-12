import { Variable, VariableLocation, VariableValueType, VariableRefType } from "./variable";

export function applyType(variable: Variable, stateVariable: boolean, storageLocation: string, parentName: string): void {
    const varType = variable.originalType;

    if (stateVariable === true) {
        variable.location = VariableLocation.Storage;
    }
    else {
        if (storageLocation === "default") {
            // look at the type to figure out where it goes
            // if value type
            let isReferenceType: boolean = false;
            isReferenceType = isReferenceType || varType.startsWith("struct"); // struct
            isReferenceType = isReferenceType || varType.includes("[") && varType.includes("]"); // array
            // TODO: mapping
            if (isReferenceType) {
                if (parentName === "ParameterList") {
                    variable.location = VariableLocation.Memory;
                }
                else {
                    variable.location = VariableLocation.Storage;
                }
            }
            else {
                // value type
                variable.location = VariableLocation.Stack;
            }
        }
        else if (storageLocation === "storage") {
            variable.location = VariableLocation.Storage;
        }
        else if (storageLocation === "memory") {
            variable.location = VariableLocation.Memory;
        }
        else {
            // default to stack i guess, probably shouldnt get here though
            variable.location = VariableLocation.Stack;
        }
    }

    if (varType.match(/bool/g)) {
        variable.type = VariableValueType.Boolean;
    }
    else if (varType.match(/uint/g)) {
        variable.type = VariableValueType.UnsignedInteger;
    }
    else if (varType.match(/.*(?:^|[^u])int.*/g)) {
        variable.type = VariableValueType.Integer;
    }
    else if (varType.match(/address/g)) {
        variable.type = VariableValueType.Address;
    }
    else if (varType.match(/(bytes)(([1-9]|[12][0-9]|3[0-2])\b)/g)) {
        variable.type = VariableValueType.FixedByteArray;
    }

    // TODO: FixedPoint when its implemented in solidity
    // TODO: Enum
    // TODO: Function
    variable.refType = VariableRefType.None;
    const arrayExpression: RegExp = /\[([0-9]*)\]/g;
    const arrayMatch = arrayExpression.exec(varType);
    if (arrayMatch) {
        variable.refType = VariableRefType.Array;
        variable.arrayIsDynamic = false; // TODO: support dynamic sized arrays
        variable.arrayLength = parseInt(arrayMatch[1]) || 0;
    }
    else if (varType.startsWith("struct")) {
        variable.refType = VariableRefType.Struct;
    }
}