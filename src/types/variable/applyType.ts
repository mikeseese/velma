import { Variable, VariableLocation, VariableType } from "./variable";
import { ValueDetail } from "./detail/value";
import { ArrayDetail } from "./detail/array";
import { StructDetail } from "./detail/struct";
import { MappingDetail } from "./detail/mapping";

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

    const detail = processDetails(variable, varType);
    if (detail !== null) {
        variable.detail = detail;
    }
}

export function processDetails(variable: Variable, typeName: string): ValueDetail | ArrayDetail | StructDetail | MappingDetail {
    // first check what the main root node is
    let leaf: ValueDetail | ArrayDetail | StructDetail | MappingDetail | null = null;
    let match: RegExpExecArray | null = null;
    // TODO: FixedPoint when its implemented in solidity
    // TODO: Enum
    // TODO: Function
    if ((match = /^bool/g.exec(typeName)) !== null) {
        // last leaf is a boolean
        leaf = new ValueDetail(variable);
        leaf.type = VariableType.Boolean;
        leaf.storageLength = 32;
    }
    else if ((match = /^uint/g.exec(typeName)) !== null) {
        // last leaf is an uint
        leaf = new ValueDetail(variable);
        leaf.type = VariableType.UnsignedInteger;

        const index = match.index + match[0].length;
        const remainder = typeName.substr(index);
        const bitMatch = /^[0-9]*/g.exec(remainder);
        if (bitMatch !== null) {
            leaf.storageLength = Math.ceil((parseInt(bitMatch[1]) || 256) / 8);
        }
        else {
            leaf.storageLength = 32;
        }
    }
    else if ((match = /^int/g.exec(typeName)) !== null) {
        // last leaf is an int
        leaf = new ValueDetail(variable);
        leaf.type = VariableType.Integer;

        const index = match.index + match[0].length;
        const remainder = typeName.substr(index);
        const bitMatch = /^[0-9]*/g.exec(remainder);
        if (bitMatch !== null) {
            leaf.storageLength = Math.ceil((parseInt(bitMatch[1]) || 256) / 8);
        }
        else {
            leaf.storageLength = 32;
        }
    }
    else if ((match = /^address/g.exec(typeName)) !== null) {
        // last leaf is an address
        leaf = new ValueDetail(variable);
        leaf.type = VariableType.Address;
    }
    else if ((match = /^(bytes)(([1-9]|[12][0-9]|3[0-2])\b)/g.exec(typeName)) !== null) {
        // last leaf is a fixed byte array
        // group 1 is the number of bytes
        leaf = new ValueDetail(variable);
        leaf.type = VariableType.FixedByteArray;
    }
    else if ((match = /^bytes/g.exec(typeName)) !== null) {
        // last leaf is a dynamic bytes array (special array)
        leaf = new ArrayDetail(variable);

        // TODO: modifiers:
        // storage pointer|ref
        // memory
        // calldata
    }
    else if ((match = /^string/g.exec(typeName)) !== null) {
        // last leaf is a string (special array)
        leaf = new ArrayDetail(variable);

        // TODO: modifiers:
        // storage pointer|ref
        // memory
        // calldata
    }
    else if ((match = /^struct ([\S]+)\.([\S])+/g.exec(typeName)) !== null) {
        // group 1 is the namespace/contract, group 2 is the name of the struct type
        leaf = new StructDetail(variable);

        // TODO: modifiers:
        // storage pointer|ref
        // memory
        // calldata
    }
    else if ((match = /^mapping\((.*?(?=(?: => )|$)) => (.*)\)/g.exec(typeName)) !== null) {
        // group 1 is the key, group 2 is the value
        // need to recurse on key and value types
        leaf = new MappingDetail(variable);
        const key = processDetails(variable, match[1]);
        if (key instanceof ValueDetail || key instanceof ArrayDetail) {
            leaf.key = key;
        }
        else {
            throw "shouldnt happen"; // TODO:
        }
        leaf.value = processDetails(variable, match[2]);
    }
    else {
        // unsupported leaf?
    }

    // awesome, we got the last leaf hopefully, lets check if we have an array of this stuff
    if (match !== null) {
        let arrays: ArrayDetail[] = [];
        let arrayMatch: RegExpExecArray | null = null;

        let index = match.index + match[0].length;

        do {
            let remainder = typeName.substr(index);
            arrayMatch = /^\[([0-9]*)\]/g.exec(remainder);
            if (arrayMatch !== null) {
                let array = new ArrayDetail(variable);

                array.isDynamic = arrayMatch[1].length === 0;
                array.length = parseInt(arrayMatch[1]) || 0;

                // TODO: modifiers:
                // storage pointer|ref
                // memory
                // calldata

                // so it's possible we have more arrays, set the next index, and try again
                index = arrayMatch.index + arrayMatch[0].length;
                arrays.push(array);
            }
        } while (arrayMatch !== null)

        if (arrays.length > 0) {
            for (let i = 0; i < arrays.length; i++) {
                if (i === 0) {
                    arrays[i].memberType = leaf!;
                }
                else {
                    arrays[i].memberType = arrays[i - 1];
                }

                if (!arrays[i].isDynamic) {
                    // array is static, and therefore initialized upon declaration, we need to fill it out members now
                    for (let j = 0; j < arrays[i].length; j++) {
                        arrays[i].members.push(arrays[i].memberType.clone());
                    }
                }
            }

            return arrays[arrays.length - 1];
        }
        else {
            return leaf!;
        }
    }
    else {
        throw "shouldnt happen";
    }
}