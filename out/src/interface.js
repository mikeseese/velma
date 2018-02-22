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
const CircularJSON = require("circular-json");
const uuidv4 = require("uuid").v4;
class LibSdbInterface {
    constructor(runtime) {
        this._runtime = runtime;
        this._debuggerMessages = new Map();
    }
    respondToDebugHook(messageId, content = null) {
        // don't respond if we don't actually need to
        if (!this._debuggerMessages.has(messageId)) {
            return;
        }
        const response = {
            "status": "ok",
            "id": messageId,
            "messageType": "response",
            "content": content
        };
        const message = CircularJSON.stringify(response);
        const debuggerMessage = this._debuggerMessages.get(messageId);
        if (debuggerMessage instanceof WebSocket) {
            debuggerMessage.send(message);
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
        const message = CircularJSON.stringify(request);
        this._debuggerMessages.set(msgId, callback);
        this._latestWs.send(message);
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
                const message = CircularJSON.stringify(request);
                this._debuggerMessages.set(msgId, resolve);
                this._latestWs.send(message);
            });
        });
    }
    messageHandler(ws, message) {
        let data;
        if (message instanceof Buffer) {
            data = CircularJSON.parse(message.toString("utf8"));
        }
        else {
            data = CircularJSON.parse(message);
        }
        const triggerType = data.triggerType;
        const messageType = data.messageType;
        if (messageType === "request") {
            this._debuggerMessages.set(data.id, ws);
            if (triggerType === "linkCompilerOutput") {
                compiler_1.LibSdbCompile.linkCompilerOutput(this._runtime._files, this._runtime._contractsByName, this._runtime._contractsByAddress, data.content.sourceRootPath, data.content.compilationResult);
                this.respondToDebugHook(data.id);
            }
            else if (triggerType === "linkContractAddress") {
                compiler_1.LibSdbCompile.linkContractAddress(this._runtime._contractsByName, this._runtime._contractsByAddress, data.content.contractName, data.content.address);
                this.respondToDebugHook(data.id);
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
            // TODO: none of this is going to work any more
            // if (data.content.type === "putCodeResponse") {
            //     // i guess we dont care right now that this is responding to the specific request yet; we will probably eventually
            //     this.respondToDebugHook(data.id); // eek, let the debugger run!
            // }
            // else if (data.content.type === "getStorage") {
            //     //
            // }
        }
    }
    serve(host, port, callback) {
        const self = this;
        this._wss = new WebSocket.Server({
            host: host,
            port: port
        }, callback);
        this._wss.on("connection", function connection(ws) {
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