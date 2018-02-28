"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const WebSocket = require("ws");
const compiler_1 = require("./compiler");
const uuidv4 = require("uuid").v4;
class LibSdbInterface {
    constructor(runtime) {
        this._runtime = runtime;
        this._debuggerMessages = new Map();
    }
    respondToDebugHook(stepEvent, messageId, content = null) {
        // don't respond if we don't actually need to
        if (!this._debuggerMessages.has(messageId)) {
            return;
        }
        if (stepEvent !== "skipEvent") {
            if (content === null) {
                content = {};
            }
            content.fastStep = stepEvent === "stopOnBreakpoint";
        }
        const response = {
            "status": "ok",
            "id": messageId,
            "messageType": "response",
            "content": content
        };
        const debuggerMessage = this._debuggerMessages.get(messageId);
        if (debuggerMessage instanceof Function) {
            debuggerMessage(response);
        }
        this._debuggerMessages.delete(messageId);
    }
    requestContent(content, callback = undefined) {
        const msgId = uuidv4();
        const request = {
            "id": msgId,
            "messageType": "request",
            "content": content
        };
        this._debuggerMessages.set(msgId, callback);
        if (this.evm !== undefined) {
            this.evm.handleMessage(request);
        }
    }
    requestStorage(address, position) {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                const msgId = uuidv4();
                const request = {
                    "id": msgId,
                    "messageType": "request",
                    "content": {
                        "type": "getStorage",
                        "address": address,
                        "position": position
                    }
                };
                this._debuggerMessages.set(msgId, resolve);
                if (this.evm !== undefined) {
                    this.evm.handleMessage(request);
                }
            });
        });
    }
    requestSendBreakpoint(id, address, pc, enabled) {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                const msgId = uuidv4();
                const request = {
                    "id": msgId,
                    "messageType": "request",
                    "content": {
                        "type": "sendBreakpoint",
                        "id": id,
                        "address": address,
                        "pc": pc,
                        "enabled": enabled
                    }
                };
                this._debuggerMessages.set(msgId, resolve);
                if (this.evm !== undefined) {
                    this.evm.handleMessage(request);
                }
            });
        });
    }
    requestSendVariableDeclarations(address, declarations) {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                const msgId = uuidv4();
                const request = {
                    "id": msgId,
                    "messageType": "request",
                    "content": {
                        "type": "sendDeclarations",
                        "address": address,
                        "declarations": declarations
                    }
                };
                this._debuggerMessages.set(msgId, resolve);
                if (this.evm !== undefined) {
                    this.evm.handleMessage(request);
                }
            });
        });
    }
    messageHandler(ws, message) {
        return __awaiter(this, void 0, void 0, function* () {
            const data = JSON.parse(message.toString());
            if (data.isRequest) {
                switch (data.type) {
                    // TODO: start?
                    case "clearBreakpoints":
                        yield this._runtime._breakpoints.clearBreakpoints(data.content.path);
                        {
                            const payload = {
                                "id": data.id,
                                "isRequest": false,
                                "type": data.type,
                                "content": {}
                            };
                            const message = JSON.stringify(payload);
                            ws.send(message);
                        }
                        break;
                    case "setBreakpoint":
                        const breakpoint = yield this._runtime._breakpoints.setBreakpoint(data.content.path, data.content.line);
                        {
                            const payload = {
                                "id": data.id,
                                "isRequest": false,
                                "type": data.type,
                                "content": {
                                    "data": breakpoint
                                }
                            };
                            const message = JSON.stringify(payload);
                            ws.send(message);
                        }
                        break;
                    case "stack":
                        const stack = this._runtime.stack(data.content.startFrame, data.content.endFrame);
                        {
                            const payload = {
                                "id": data.id,
                                "isRequest": false,
                                "type": data.type,
                                "content": {
                                    "data": stack
                                }
                            };
                            const message = JSON.stringify(payload);
                            ws.send(message);
                        }
                        break;
                    case "variables":
                        const variables = yield this._runtime.variables();
                        {
                            const payload = {
                                "id": data.id,
                                "isRequest": false,
                                "type": data.type,
                                "content": {
                                    "data": variables
                                }
                            };
                            const message = JSON.stringify(payload);
                            ws.send(message);
                        }
                        break;
                    case "uiAction":
                        let error = "";
                        switch (data.content.action) {
                            case "continue":
                                this._runtime.continue();
                                break;
                            case "continueReverse":
                                this._runtime.continue(true);
                                break;
                            case "stepOver":
                                this._runtime.stepOver();
                                break;
                            case "stepBack":
                                this._runtime.stepOver(true);
                                break;
                            case "stepIn":
                                this._runtime.stepIn();
                                break;
                            case "stepOut":
                                this._runtime.stepOut();
                                break;
                            default:
                                error = "Unsupported Debugger Action (" + data.content.action + ")";
                                break;
                        }
                        {
                            let payload = {
                                "id": data.id,
                                "isRequest": false,
                                "type": data.type,
                                "content": {}
                            };
                            if (error) {
                                payload.error = error;
                            }
                            const message = JSON.stringify(payload);
                            ws.send(message);
                        }
                        break;
                    case "evaluate":
                        this._runtime._evaluator.evaluate(data.content.expression, data.content.context, data.content.frameId, (reply) => {
                            const payload = {
                                "id": data.id,
                                "isRequest": false,
                                "type": data.type,
                                "content": {
                                    "data": reply
                                }
                            };
                            const message = JSON.stringify(payload);
                            ws.send(message);
                        });
                        break;
                    default:
                        // respond unsupported call?
                        {
                            const payload = {
                                "id": data.id,
                                "isRequest": false,
                                "type": data.type,
                                "content": {
                                    "error": "Unsupported Request Type (" + data.type + ")"
                                }
                            };
                            const message = JSON.stringify(payload);
                            ws.send(message);
                        }
                        break;
                }
            }
            else {
                switch (data.type) {
                    case "ping":
                        const debuggerMessage = this._debuggerMessages.get(data.id);
                        if (debuggerMessage instanceof Function) {
                            debuggerMessage(true);
                        }
                        this._debuggerMessages.delete(data.id);
                        break;
                }
            }
        });
    }
    receiveFromEvm(data) {
        return __awaiter(this, void 0, void 0, function* () {
            const triggerType = data.triggerType;
            const messageType = data.messageType;
            if (messageType === "request") {
                this._debuggerMessages.set(data.id, (message) => {
                    this.evm.handleMessage(message);
                });
                if (triggerType === "linkCompilerOutput") {
                    compiler_1.LibSdbCompile.linkCompilerOutput(this._runtime._files, this._runtime._contractsByName, this._runtime._contractsByAddress, data.content.sourceRootPath, data.content.compilationResult);
                    this.respondToDebugHook("stopOnBreakpoint", data.id);
                }
                else if (triggerType === "linkContractAddress") {
                    const contract = compiler_1.LibSdbCompile.linkContractAddress(this._runtime._contractsByName, this._runtime._contractsByAddress, data.content.contractName, data.content.address);
                    if (contract !== null) {
                        yield this._runtime._breakpoints.verifyBreakpoints(contract.sourcePath);
                        yield this._runtime.sendVariableDeclarations(contract.address);
                    }
                    this.respondToDebugHook("stopOnBreakpoint", data.id);
                }
                else if (triggerType === "step" || triggerType === "exception") {
                    this._runtime.vmStepped(data);
                }
            }
            else if (messageType === "response") {
                const debuggerMessage = this._debuggerMessages.get(data.id);
                if (debuggerMessage instanceof Function) {
                    debuggerMessage(data.content);
                }
                this._debuggerMessages.delete(data.id);
            }
        });
    }
    sendEvent(event, ...args) {
        if (this._latestWs instanceof WebSocket) {
            const eventPayload = {
                "id": uuidv4(),
                "isRequest": true,
                "type": "event",
                "content": {
                    "event": event,
                    "args": args
                }
            };
            const message = JSON.stringify(eventPayload);
            this._latestWs.send(message);
        }
    }
    ping(callback) {
        if (this._latestWs instanceof WebSocket) {
            const payload = {
                "id": uuidv4(),
                "isRequest": true,
                "type": "ping",
                "content": {}
            };
            this._debuggerMessages.set(payload.id, callback);
            setTimeout(() => {
                this._debuggerMessages.delete(payload.id);
                callback(false);
            }, 1000);
            const message = JSON.stringify(payload);
            this._latestWs.send(message);
        }
        else {
            callback(false);
        }
    }
    serve(host, port, callback) {
        const self = this;
        this._wss = new WebSocket.Server({
            host: host,
            port: port
        });
        this._wss.on("connection", function connection(ws) {
            callback();
            self._latestWs = ws;
            ws.on("message", (message) => {
                self.messageHandler(ws, message);
            });
            ws.on("close", (code, reason) => {
                self._wss.close();
                self._runtime.sendEvent("end");
            });
        });
    }
}
exports.LibSdbInterface = LibSdbInterface;
//# sourceMappingURL=interface.js.map