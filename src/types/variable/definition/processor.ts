import { Variable, VariableLocation, VariableType } from "../variable";
import { ValueDetail } from "../detail/value";
import { ArrayDetail } from "../detail/array";
import { StructDetail } from "../detail/struct";
import { MappingDetail } from "../detail/mapping";

import { LibSdbRuntime } from "../../../runtime";
import { ContractDetail } from "../detail/contract";
import { LibSdbTypes } from "../../types";
import { ContractProcessor } from "../../../compilation/contractProcessor";

export class VariableProcessor {
    private _runtime: LibSdbRuntime;
    private _variable: Variable;
    private _contractProcessor: ContractProcessor;

    constructor(variable: Variable, contractProcessor: ContractProcessor) {
        this._runtime = LibSdbRuntime.instance();
        this._variable = variable;
        this._contractProcessor = contractProcessor;
    }

    public applyType(storageLocation: string, parentName: string): void {
        const varType = this._variable.originalType;

        if (this._variable.isStateVariable === true) {
            this._variable.location = VariableLocation.Storage;
        }
        else {
            if (storageLocation === "default") {
                // look at the type to figure out where it goes
                // if value type
                let isReferenceType: boolean = false;
                isReferenceType = isReferenceType || varType.startsWith("struct"); // struct
                isReferenceType = isReferenceType || varType.startsWith("mapping"); // mapping
                isReferenceType = isReferenceType || varType.includes("[") && varType.includes("]"); // array
                if (isReferenceType) {
                    if (parentName === "ParameterList") {
                        this._variable.location = VariableLocation.Memory;
                    }
                    else {
                        this._variable.location = VariableLocation.Storage;
                    }
                }
                else {
                    // value type
                    this._variable.location = VariableLocation.Stack;
                }
            }
            else if (storageLocation === "storage") {
                this._variable.location = VariableLocation.Storage;
            }
            else if (storageLocation === "memory") {
                this._variable.location = VariableLocation.Memory;
            }
            else {
                // default to stack i guess, probably shouldnt get here though
                this._variable.location = VariableLocation.Stack;
            }
        }

        this._variable.detail = this.processDetails(varType);
    }

    public processDetails(typeName: string, isRoot: boolean = true): LibSdbTypes.VariableDetailType | null {
        // first check what the main root node is
        let leaf: LibSdbTypes.VariableDetailType | null = null;
        let match: RegExpExecArray | null = null;
        let remainderTypeName: string = "";
        let result: LibSdbTypes.VariableDetailType;

        // TODO: FixedPoint when its implemented in solidity
        // TODO: Enum
        // TODO: Function

        if ((match = /^bool/g.exec(typeName)) !== null) {
            remainderTypeName = typeName.substr(match.index + match[0].length);
            // last leaf is a boolean
            leaf = new ValueDetail(this._variable);
            leaf.type = VariableType.Boolean;
            leaf.storageLength = 32; // TODO: is this right?
        }
        else if ((match = /^uint/g.exec(typeName)) !== null) {
            remainderTypeName = typeName.substr(match.index + match[0].length);
            // last leaf is an uint
            leaf = new ValueDetail(this._variable);
            leaf.type = VariableType.UnsignedInteger;

            const index = match.index + match[0].length;
            const remainder = typeName.substr(index);
            const bitMatch = /^[0-9]+/g.exec(remainder);
            if (bitMatch !== null) {
                leaf.storageLength = Math.ceil((parseInt(bitMatch[0]) || 256) / 8);
                remainderTypeName = remainder.substr(bitMatch.index + bitMatch[0].length);
            }
            else {
                leaf.storageLength = 32;
            }
        }
        else if ((match = /^int/g.exec(typeName)) !== null) {
            remainderTypeName = typeName.substr(match.index + match[0].length);
            // last leaf is an int
            leaf = new ValueDetail(this._variable);
            leaf.type = VariableType.Integer;

            const index = match.index + match[0].length;
            const remainder = typeName.substr(index);
            const bitMatch = /^[0-9]+/g.exec(remainder);
            if (bitMatch !== null) {
                leaf.storageLength = Math.ceil((parseInt(bitMatch[0]) || 256) / 8);
                remainderTypeName = remainder.substr(bitMatch.index + bitMatch[0].length);
            }
            else {
                leaf.storageLength = 32;
            }
        }
        else if ((match = /^address/g.exec(typeName)) !== null) {
            remainderTypeName = typeName.substr(match.index + match[0].length);
            // last leaf is an address
            leaf = new ValueDetail(this._variable);
            leaf.type = VariableType.Address;
            leaf.storageLength = 20; // TODO: is this right?
        }
        else if ((match = /^(bytes)([1-9]|[12][0-9]|3[0-2])\b/g.exec(typeName)) !== null) {
            remainderTypeName = typeName.substr(match.index + match[0].length);
            // last leaf is a fixed byte array
            // group 1 is the number of bytes
            leaf = new ValueDetail(this._variable);
            leaf.type = VariableType.FixedByteArray;
            leaf.storageLength = parseInt(match[2]) || 32;
        }
        else if ((match = /^bytes/g.exec(typeName)) !== null) {
            remainderTypeName = typeName.substr(match.index + match[0].length);
            // last leaf is a dynamic bytes array (special array)
            leaf = new ArrayDetail(this._variable);
            this._runtime._variableReferenceIds.set(leaf.id, leaf);

            // A `bytes` is similar to `byte[]`, but it is packed tightly in calldata.

            // the member of the `bytes` array is a single byte
            leaf.memberType = new ValueDetail(this._variable);
            leaf.memberType.type = VariableType.FixedByteArray;
            leaf.memberType.storageLength = 32;

            const index = match.index + match[0].length;
            const remainder = typeName.substr(index);
            const locationMatch = /^ (storage|memory|calldata) ?(pointer|ref)?/g.exec(remainder);
            if (locationMatch !== null) {
                const locationString = locationMatch[1].trim();
                switch (locationString) {
                    case "storage":
                        leaf.location = VariableLocation.Storage;
                        leaf.isPointer = locationMatch[2] === "pointer";
                        break;
                    case "memory":
                        leaf.location = VariableLocation.Memory;
                        leaf.isPointer = false;
                        break;
                    case "calldata":
                        leaf.location = VariableLocation.CallData;
                        leaf.isPointer = false;
                        break;
                }
                remainderTypeName = remainder.substr(locationMatch.index + locationMatch[0].length);
            }

            // per the above comment, `bytes` is a dynamic sized `byte` array with special packing
            leaf.isDynamic = true;
        }
        else if ((match = /^string/g.exec(typeName)) !== null) {
            remainderTypeName = typeName.substr(match.index + match[0].length);
            // last leaf is a string (special array)
            leaf = new ArrayDetail(this._variable);
            this._runtime._variableReferenceIds.set(leaf.id, leaf);

            // `string` is equal to `bytes` but does not allow length or index access (for now).

            // the member of the `string` array is a single byte
            leaf.memberType = new ValueDetail(this._variable);
            leaf.memberType.type = VariableType.FixedByteArray;
            leaf.memberType.storageLength = 32;

            const index = match.index + match[0].length;
            const remainder = typeName.substr(index);
            const locationMatch = /^ (storage|memory|calldata) ?(pointer|ref)?/g.exec(remainder);
            if (locationMatch !== null) {
                const locationString = locationMatch[1].trim();
                switch (locationString) {
                    case "storage":
                        leaf.location = VariableLocation.Storage;
                        leaf.isPointer = locationMatch[2] === "pointer";
                        break;
                    case "memory":
                        leaf.location = VariableLocation.Memory;
                        leaf.isPointer = false;
                        break;
                    case "calldata":
                        leaf.location = VariableLocation.CallData;
                        leaf.isPointer = false;
                        break;
                }
                remainderTypeName = remainder.substr(locationMatch.index + locationMatch[0].length);
            }

            // per the above comment, `string` is a `bytes` with out some access, which is always dynamically sized
            leaf.isDynamic = true;
        }
        else if ((match = /^struct ([\S]+)\.([^\r\n\t\f\v \[]+)/g.exec(typeName)) !== null) {
            remainderTypeName = typeName.substr(match.index + match[0].length);
            // group 1 is the namespace/contract, group 2 is the name of the struct type
            leaf = new StructDetail(this._variable);
            this._runtime._variableReferenceIds.set(leaf.id, leaf);

            const index = match.index + match[0].length;
            const remainder = typeName.substr(index);
            const locationMatch = /^ (storage|memory|calldata) ?(pointer|ref)?/g.exec(remainder);
            if (locationMatch !== null) {
                const locationString = locationMatch[1].trim();
                switch (locationString) {
                    case "storage":
                        leaf.location = VariableLocation.Storage;
                        leaf.isPointer = locationMatch[2] === "pointer";
                        break;
                    case "memory":
                        leaf.location = VariableLocation.Memory;
                        leaf.isPointer = false;
                        break;
                    case "calldata":
                        leaf.location = VariableLocation.CallData;
                        leaf.isPointer = false;
                        break;
                }
                remainderTypeName = remainder.substr(locationMatch.index + locationMatch[0].length);
            }

            const structContractName = match[1];
            const structName = match[2];
            leaf.name = structContractName + "." + structName;

            const contract = this._runtime._contractsByName.get(structContractName);
            if (contract) {
                const structDefinitionScopeId = contract.structDefinitions.get(structName);
                if (structDefinitionScopeId !== undefined) {
                    const structVariables = contract.scopeVariableMap.get(structDefinitionScopeId);
                    if (structVariables !== undefined) {
                        // fill out leaf members?
                        for (const structVariable of structVariables) {
                            let variable = structVariable[1].clone();
                            variable.location = leaf.location;
                            if (variable.detail !== null) {
                                variable.detail.variable = leaf.variable;
                            }
                            leaf.members.push({
                                name: variable.name,
                                detail: variable.detail
                            });
                        }
                    }
                }
            }
        }
        else if ((match = /^mapping\((.*?(?=(?: => )|$)) => (.*)\)/g.exec(typeName)) !== null) {
            remainderTypeName = typeName.substr(match.index + match[0].length);
            // group 1 is the key, group 2 is the value
            // need to recurse on key and value types
            leaf = new MappingDetail(this._variable);
            this._runtime._variableReferenceIds.set(leaf.id, leaf);
            const key = this.processDetails(match[1], false);
            if (key instanceof ValueDetail || key instanceof ArrayDetail) {
                leaf.key = key;
            }
            else {
                throw "shouldnt happen"; // TODO:
            }
            leaf.value = this.processDetails(match[2], false);
        }
        else if ((match = /^contract ([^\r\n\t\f\v \[]+)/g.exec(typeName)) !== null) {
            remainderTypeName = typeName.substr(match.index + match[0].length);

            leaf = new ContractDetail(this._variable);
            leaf.name = match[1];
        }
        else {
            // unsupported leaf? as of now, this will get thrown (in the else of the below statement)
            //   probably should handle this better
        }

        if (match !== null) {
            // awesome, we got the last leaf hopefully, lets check if we have an array of this stuff
            let arrays: ArrayDetail[] = [];
            let arrayMatch: RegExpExecArray | null = null;

            do {
                arrayMatch = /^\[([0-9]*)\]/g.exec(remainderTypeName);
                if (arrayMatch !== null) {
                    let array = new ArrayDetail(this._variable);
                    this._runtime._variableReferenceIds.set(array.id, array);

                    array.isDynamic = arrayMatch.length === 0;
                    array.length = arrayMatch.length > 0 ? parseInt(arrayMatch[1]) : 0;

                    const index2 = arrayMatch.index + arrayMatch[0].length;
                    const remainder = remainderTypeName.substr(index2);
                    const locationMatch = /^ (storage|memory|calldata) ?(pointer|ref)?/g.exec(remainder);
                    if (locationMatch !== null) {
                        const locationString = locationMatch[1].trim();
                        switch (locationString) {
                            case "storage": {
                                array.location = VariableLocation.Storage;
                                array.isPointer = locationMatch[2] === "pointer";
                                break;
                            }
                            case "memory": {
                                array.location = VariableLocation.Memory;
                                array.isPointer = false;
                                break;
                            }
                            case "calldata": {
                                array.location = VariableLocation.CallData;
                                array.isPointer = false;
                                break;
                            }
                        }
                        remainderTypeName = remainderTypeName.substr(locationMatch.index + locationMatch[0].length);
                    }

                    // so it's possible we have more arrays, set the next index, and try again
                    remainderTypeName = remainderTypeName.substr(arrayMatch.index + arrayMatch[0].length);
                    arrays.push(array);
                }
            } while (remainderTypeName !== "")

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
                            let clone = arrays[i].memberType.clone();
                            if (j === 0) {
                                clone.position = 0;
                            }
                            else {
                                clone.position = arrays[i].members[j - 1].position + arrays[i].members[j - 1].memoryLength;
                            }
                            arrays[i].members.push(clone);
                            if (!(clone instanceof ValueDetail)) {
                                this._runtime._variableReferenceIds.set(clone.id, clone);
                            }
                        }
                    }
                }

                result = arrays[arrays.length - 1];
            }
            else {
                result = leaf!;
            }

            if (isRoot) {
                // we are processing the root, the entire tree of details have been added at this point
                //   let's determine the position for everything

                this.applyPositions(result);
            }

            return result;
        }
        else {
            // Type not supported yet
            return null;
        }
    }

    private applyMemoryPositions(detail: LibSdbTypes.VariableDetailType, offsetPosition: number = 0): void {
        // offet is only used for storage
        detail.offset = null;

        if (detail instanceof ValueDetail) {
            detail.position = offsetPosition;
        }
        else if (detail instanceof ArrayDetail) {
            if (!detail.isDynamic) {
                // fixed array, we got members
                if (!(detail.memberType instanceof ArrayDetail) || !detail.memberType.isDynamic) {
                    // we won't know the length for dynamic arrays
                    for (let i = 0; i < detail.members.length; i++) {
                        this.applyMemoryPositions(detail.members[i], i * detail.memberType.memoryLength);
                    }
                }
            }
        }
        else if (detail instanceof StructDetail) {
            let currentSize = 0;
            for (let i = 0; i < detail.members.length; i++) {
                const memberDetail = detail.members[i].detail;
                if (memberDetail !== null && (!(memberDetail instanceof ArrayDetail) || !(memberDetail as ArrayDetail).isDynamic)) {
                    // we won't know the length for dynamic arrays
                    this.applyMemoryPositions(memberDetail, currentSize);
                    currentSize += memberDetail.memoryLength;
                }
            }
        }
        else if (detail instanceof MappingDetail) {
            // Mappings are only allowed for state variables (or as storage reference types in internal functions).
            // this isn't applicable/feasible
        }
        else if (detail instanceof ContractDetail) {
            detail.position = offsetPosition;
        }
    }

    private storageIncrementSlot(): void {
        this._contractProcessor._currentStorageSlot++;
        this._contractProcessor._currentStorageSlotOffset = 0;
    }

    private storageIncrementOffset(offset: number): void {
        this._contractProcessor._currentStorageSlotOffset += offset;
    }

    private storageCheckSpaceLeft(storageLength: number): void {
        // check if we have enough space
        const spaceLeft = 32 - this._contractProcessor._currentStorageSlotOffset;
        if (spaceLeft - storageLength < 0) {
            this.storageIncrementSlot();
        }
    }

    private storageCheckNewSlotRequired(): void {
        if (this._contractProcessor._currentStorageSlotOffset > 0) {
            // always start new slots for arrays, structs, and mappings
            this.storageIncrementSlot();
        }
    }

    private storageCheckEndOfSlot(): void {
        if (this._contractProcessor._currentStorageSlotOffset >= 32) {
            this.storageIncrementSlot();
        }
    }

    private applyStoragePosition(detail: LibSdbTypes.VariableDetailType): void {
        detail.position = this._contractProcessor._currentStorageSlot;
        detail.offset = this._contractProcessor._currentStorageSlotOffset;
    }

    private applyStoragePositions(detail: LibSdbTypes.VariableDetailType): void {
        if (detail instanceof ValueDetail) {
            this.storageCheckSpaceLeft(detail.storageLength);
            this.applyStoragePosition(detail);
            this.storageIncrementOffset(detail.storageLength);
            this.storageCheckEndOfSlot();
        }
        else if (detail instanceof ArrayDetail) {
            this.storageCheckNewSlotRequired();
            this.applyStoragePosition(detail);
            if (!detail.isDynamic) {
                // TODO: do storage for children
            }
            if (detail.position === this._contractProcessor._currentStorageSlot || this._contractProcessor._currentStorageSlotOffset > 0) {
                // occupy whole slots
                this.storageIncrementSlot();
            }
        }
        else if (detail instanceof StructDetail) {
            this.storageCheckNewSlotRequired();
            this.applyStoragePosition(detail);
            // TODO: do storage for children
            if (detail.position === this._contractProcessor._currentStorageSlot || this._contractProcessor._currentStorageSlotOffset > 0) {
                // occupy whole slots
                this.storageIncrementSlot();
            }
        }
        else if (detail instanceof MappingDetail) {
            this.storageCheckNewSlotRequired();
            this.applyStoragePosition(detail);
            this.storageIncrementSlot();
        }
        else if (detail instanceof ContractDetail) {
            this.storageCheckSpaceLeft(detail.storageLength);
            this.applyStoragePosition(detail);
            this.storageCheckEndOfSlot();
        }
    }

    public applyPositions(detail: LibSdbTypes.VariableDetailType): void {
        switch (detail.variable.location) {
            case (VariableLocation.Stack): {
                // the detail's position is just the stack position
                // this means the variable is a value type at the root (not an array/struct/mapping)
                detail.position = 0;
                detail.offset = null;
                break;
            }
            case (VariableLocation.Memory): {
                this.applyMemoryPositions(detail);
                break;
            }
            case (VariableLocation.CallData): {
                // offet is only used for storage
                detail.offset = null;

                // TODO: i don't even know what to do with calldata
                break;
            }
            case (VariableLocation.Storage): {
                this.applyStoragePositions(detail);
                break;
            }
        }
    }
}