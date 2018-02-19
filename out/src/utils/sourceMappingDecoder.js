"use strict";
// NOTE: This file was copied/ported to TypeScript from the ethereum/remix project at https://github.com/ethereum/remix
// History of modifications made from Remix are not captured in this repository. See https://github.com/seeseplusplus/remix/tree/introduce-sdb for history
// Remix is under the MIT License:
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
Object.defineProperty(exports, "__esModule", { value: true });
const astWalker_1 = require("./astWalker");
const misc_1 = require("./misc");
/**
 * Decompress the source mapping given by solc-bin.js
 */
var SourceMappingDecoder;
(function (SourceMappingDecoder) {
    // s:l:f:j
    /**
     * Decode the given @arg value
     *
     * @param {string} value      - source location to decode ( should be start:length:file )
     * @return {Object} returns the decompressed source mapping {start, length, file}
     */
    function decode(value) {
        if (value) {
            value = value.split(':');
            return {
                start: parseInt(value[0]),
                length: parseInt(value[1]),
                file: parseInt(value[2])
            };
        }
    }
    SourceMappingDecoder.decode = decode;
    /**
     * Decode the source mapping for the given compressed mapping
     *
     * @param {String} mapping     - compressed source mapping given by solc-bin
     * @return {Array} returns the decompressed source mapping. Array of {start, length, file, jump}
     */
    function decompressAll(mapping) {
        let map = mapping.split(';');
        let ret = [];
        for (let k in map) {
            let compressed = map[k].split(':');
            let sourceMap = {
                start: compressed[0] ? parseInt(compressed[0]) : ret[ret.length - 1].start,
                length: compressed[1] ? parseInt(compressed[1]) : ret[ret.length - 1].length,
                file: compressed[2] ? parseInt(compressed[2]) : ret[ret.length - 1].file,
                jump: compressed[3] ? compressed[3] : ret[ret.length - 1].jump
            };
            ret.push(sourceMap);
        }
        return ret;
    }
    SourceMappingDecoder.decompressAll = decompressAll;
    /**
      * Retrieve line/column position of each source char
      *
      * @param {String} source - contract source code
      * @return {Arrray} returns an array containing offset of line breaks
      */
    function getLinebreakPositions(source) {
        let ret = [];
        for (let pos = source.indexOf('\n'); pos >= 0; pos = source.indexOf('\n', pos + 1)) {
            ret.push(pos);
        }
        return ret;
    }
    SourceMappingDecoder.getLinebreakPositions = getLinebreakPositions;
    /**
     * Retrieve the line/colum position for the given source mapping
     *
     * @param {Object} sourceLocation - object containing attributes {source} and {length}
     * @param {Array} lineBreakPositions - array returned by the function 'getLinebreakPositions'
     * @return {Object} returns an object {start: {line, column}, end: {line, column}} (line/column count start at 0)
     */
    function convertOffsetToLineColumn(sourceLocation, lineBreakPositions) {
        if (sourceLocation.start >= 0 && sourceLocation.length >= 0) {
            return {
                start: convertFromCharPosition(sourceLocation.start, lineBreakPositions),
                end: convertFromCharPosition(sourceLocation.start + sourceLocation.length, lineBreakPositions)
            };
        }
        else {
            return {
                start: null,
                end: null
            };
        }
    }
    SourceMappingDecoder.convertOffsetToLineColumn = convertOffsetToLineColumn;
    function convertFromCharPosition(pos, lineBreakPositions) {
        let line = misc_1.findLowerBound(pos, lineBreakPositions);
        if (lineBreakPositions[line] !== pos) {
            line = line + 1;
        }
        let beginColumn = line === 0 ? 0 : (lineBreakPositions[line - 1] + 1);
        let column = pos - beginColumn;
        return {
            line: line,
            column: column
        };
    }
    SourceMappingDecoder.convertFromCharPosition = convertFromCharPosition;
    function sourceLocationFromAstNode(astNode) {
        if (astNode.src) {
            let split = astNode.src.split(':');
            return {
                start: parseInt(split[0]),
                length: parseInt(split[1]),
                file: parseInt(split[2])
            };
        }
        return null;
    }
    SourceMappingDecoder.sourceLocationFromAstNode = sourceLocationFromAstNode;
    /**
     * Retrieve the first @arg astNodeType that include the source map at arg instIndex
     *
     * @param {String} astNodeType - node type that include the source map instIndex
     * @param {String} instIndex - instruction index used to retrieve the source map
     * @param {String} sourceMap - source map given by the compilation result
     * @param {Object} ast - ast given by the compilation result
     */
    function findNodeAtInstructionIndex(astNodeType, instIndex, sourceMap, ast) {
        let sourceLocation = atIndex(instIndex, sourceMap);
        return findNodeAtSourceLocation(astNodeType, sourceLocation, ast);
    }
    SourceMappingDecoder.findNodeAtInstructionIndex = findNodeAtInstructionIndex;
    function findNodeAtSourceLocation(astNodeType, sourceLocation, ast) {
        let astWalker = new astWalker_1.AstWalker();
        let callback = {};
        let found = null;
        callback['*'] = function (node) {
            let nodeLocation = sourceLocationFromAstNode(node);
            if (!nodeLocation) {
                return true;
            }
            if (nodeLocation.start <= sourceLocation.start && nodeLocation.start + nodeLocation.length >= sourceLocation.start + sourceLocation.length) {
                if (astNodeType === node.name) {
                    found = node;
                    return false;
                }
                else {
                    return true;
                }
            }
            else {
                return false;
            }
        };
        astWalker.walk(ast.AST, callback);
        return found;
    }
    SourceMappingDecoder.findNodeAtSourceLocation = findNodeAtSourceLocation;
    /**
     * get a list of nodes that are at the given @arg position
     *
     * @param {String} astNodeType      - type of node to return
     * @param {Int} position     - cursor position
     * @return {Object} ast object given by the compiler
     */
    function nodesAtPosition(astNodeType, position, ast) {
        let astWalker = new astWalker_1.AstWalker();
        let callback = {};
        let found = [];
        callback['*'] = function (node) {
            let nodeLocation = sourceLocationFromAstNode(node);
            if (!nodeLocation) {
                return;
            }
            if (nodeLocation.start <= position && nodeLocation.start + nodeLocation.length >= position) {
                if (!astNodeType || astNodeType === node.name) {
                    found.push(node);
                    if (astNodeType) {
                        return false;
                    }
                }
                return true;
            }
            else {
                return false;
            }
        };
        astWalker.walk(ast.AST, callback);
        return found;
    }
    SourceMappingDecoder.nodesAtPosition = nodesAtPosition;
    /**
     * Decode the source mapping for the given @arg index
     *
     * @param {Integer} index      - source mapping index to decode
     * @param {String} mapping     - compressed source mapping given by solc-bin
     * @return {Object} returns the decompressed source mapping for the given index {start, length, file, jump}
     */
    function atIndex(index, mapping) {
        let ret = {};
        let map = mapping.split(';');
        if (index >= map.length) {
            index = map.length - 1;
        }
        for (let k = index; k >= 0; k--) {
            let current = map[k];
            if (!current.length) {
                continue;
            }
            current = current.split(':');
            if (ret.start === undefined && current[0] && current[0] !== '-1' && current[0].length) {
                ret.start = parseInt(current[0]);
            }
            if (ret.length === undefined && current[1] && current[1] !== '-1' && current[1].length) {
                ret.length = parseInt(current[1]);
            }
            if (ret.file === undefined && current[2] && current[2] !== '-1' && current[2].length) {
                ret.file = parseInt(current[2]);
            }
            if (ret.jump === undefined && current[3] && current[3].length) {
                ret.jump = current[3];
            }
            if (ret.start !== undefined && ret.length !== undefined && ret.file !== undefined && ret.jump !== undefined) {
                break;
            }
        }
        return ret;
    }
    SourceMappingDecoder.atIndex = atIndex;
    function toIndex(sourceLocation, mapping) {
        let map = mapping.split(';');
        let index = null;
        let decompressedCurrent = {};
        for (let k = 0; k < map.length; k++) {
            let current = map[k];
            if (!current.length) {
                continue;
            }
            current = current.split(':');
            if (decompressedCurrent.start === undefined && current[0] && current[0] !== '-1' && current[0].length) {
                let start = parseInt(current[0]);
                if (start === sourceLocation.start) {
                    decompressedCurrent.start = start;
                }
            }
            if (decompressedCurrent.length === undefined && current[1] && current[1] !== '-1' && current[1].length) {
                let length = parseInt(current[1]);
                if (length === sourceLocation.length) {
                    decompressedCurrent.length = length;
                }
            }
            // TODO: don't think this will work for me (seesemichaelj) currently; need to make sure this works for my code before enabling
            /*if (decompressedCurrent.file === undefined && current[2] && current[2] !== '-1' && current[2].length) {
            let file = parseInt(current[2])
            if (file === sourceLocation.file) {
                decompressedCurrent.file = file
            }
            decompressedCurrent.file = file
            }*/
            if (decompressedCurrent.jump === undefined && current[3] && current[3].length) {
                let jump = current[3];
                if (jump === sourceLocation.jump) {
                    decompressedCurrent.jump = jump;
                }
            }
            // sourceLocation.jump can be undefined if coming from solc AST
            if (decompressedCurrent.start !== undefined && decompressedCurrent.length !== undefined && /* TODO: decompressedCurrent.file !== undefined &&*/
                (sourceLocation.jump === undefined || decompressedCurrent.jump !== undefined)) {
                index = k;
                break;
            }
        }
        return index;
    }
    SourceMappingDecoder.toIndex = toIndex;
})(SourceMappingDecoder = exports.SourceMappingDecoder || (exports.SourceMappingDecoder = {}));
//# sourceMappingURL=sourceMappingDecoder.js.map