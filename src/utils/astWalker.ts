
// NOTE: This file was copied/ported to TypeScript from the ethereum/remix project at https://github.com/ethereum/remix
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

export class AstWalker {
    /**
     * visit all the AST nodes
     *
     * @param {Object} ast  - AST node
     * @param {Object or Function} callback  - if (Function) the function will be called for every node.
     *                                       - if (Object) callback[<Node Type>] will be called for
     *                                         every node of type <Node Type>. callback["*"] will be called fo all other nodes.
     *                                         in each case, if the callback returns false it does not descend into children.
     *                                         If no callback for the current type, children are visited.
     */
    public walk(ast, callback) {
        if (callback instanceof Function) {
            callback = {'*': callback}
        }
        if (!('*' in callback)) {
            callback['*'] = function () { return true }
        }
        if (this.manageCallBack(ast, callback) && ast.children && ast.children.length > 0) {
            for (const k in ast.children) {
                const child = ast.children[k]
                this.walk(child, callback)
            }
        }
    }

    public walkDetail(ast, parent, depth, callback) {
        if (callback instanceof Function) {
            callback = {'*': callback}
        }
        if (!('*' in callback)) {
            callback['*'] = function () { return true }
        }
        if (this.manageCallBackDetail(ast, parent, depth, callback) && ast.children && ast.children.length > 0) {
            for (const k in ast.children) {
                const child = ast.children[k]
                this.walkDetail(child, ast, depth + 1, callback)
            }
        }
    }

    /**
     * walk the given @astList
     *
     * @param {Object} sourcesList - sources list (containing root AST node)
     * @param {Function} - callback used by AstWalker to compute response
     */
    public walkAstList(sourcesList, callback) {
        const walker = new AstWalker()
        for (const k in sourcesList) {
            walker.walk(sourcesList[k].AST, callback)
        }
    }

    private manageCallBack(node, callback) {
        if (node.name in callback) {
            return callback[node.name](node)
        } else {
            return callback['*'](node)
        }
    }
    
    private manageCallBackDetail(node, parent, depth, callback) {
        if (node.name in callback) {
            return callback[node.name](node, parent, depth)
        } else {
            return callback['*'](node, parent, depth)
        }
    }
}