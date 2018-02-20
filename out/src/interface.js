"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const WebSocket = require("ws");
const compiler_1 = require("./compiler");
const CircularJSON = require("circular-json");
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
        this._debuggerMessages.get(messageId).send(message);
        this._debuggerMessages.delete(messageId);
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
        else if (messageType === "response") {
            if (data.content && data.content.type === "putCodeResponse") {
                // i guess we dont care right now that this is responding to the specific request yet; we will probably eventually
                this.respondToDebugHook(data.id); // eek, let the debugger run!
            }
        }
    }
    serve(host, port, callback) {
        const self = this;
        this._wss = new WebSocket.Server({
            host: host,
            port: port
        }, callback);
        this._wss.on("connection", function connection(ws) {
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