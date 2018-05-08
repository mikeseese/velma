
// NOTE: This file was copied/ported to TypeScript from the ethereum/remix project at https://github.com/ethereum/remix
// History of modifications made from Remix are not captured in this repository. See https://github.com/seeseplusplus/remix/tree/introduce-sdb for history
// Remix (and therefore this file) is under the MIT License:
/* The MIT License (MIT)
 *
 * Copyright (c) 2016
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import { getOpcode } from "./opcodes";
import { LibSdbTypes } from "../types/types";

export function nameOpCodes(raw: Buffer): Map<number, LibSdbTypes.EvmInstruction> {
    let result = new Map<number, LibSdbTypes.EvmInstruction>();

    for (let i = 0; i < raw.length; i++) {
        let pc = i;
        let curOpCode = getOpcode(raw[pc], false);
        // no destinations into the middle of PUSH
        if (curOpCode.name.slice(0, 4) === 'PUSH') {
            let jumpNum = raw[pc] - 0x5f;
            i += jumpNum;
        }

        result.set(pc, <LibSdbTypes.EvmInstruction> {index: result.size, opcode: curOpCode})
    }

    return result;
}

export function pad(num, size) {
    let s = num + '';
    while (s.length < size) {
        s = '0' + s;
    }
    return s;
}

export function log(num, base) {
    return Math.log(num) / Math.log(base);
}

export function roundLog(num, base) {
    return Math.ceil(log(num, base));
}