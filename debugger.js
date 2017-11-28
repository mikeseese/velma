const uuidv4 = require("uuid/v4");
const net = require("net");
const CircularJSON = require("circular-json");
const fs = require("fs");
const solc = require("solc");

const EventManager = require("../remix/src/lib/eventManager");
const TraceManager = require("../remix/src/trace/traceManager");
const CodeManager = require("../remix/src/code/codeManager");
const SolidityProxy = require("../remix/src/solidity/solidityProxy");
const InternalCallTree = require("../remix/src/util/internalCallTree");
const StepManager = require("../remix/src/ui/StepManager");
const BreakpointManager = require("../remix/src/code/breakpointManager");
const Web3Providers = require('../remix/src/web3Provider/web3Providers');
const GlobalRemixUtil = require('../remix/src/helpers/global');
const SourceMappingDecoder = require('../remix/src/util/sourceMappingDecoder');

let currentStepIndex = -1;
let web3Providers = new Web3Providers();
let event = new EventManager();
let traceManager = new TraceManager();
let codeManager = new CodeManager(traceManager);
let solidityProxy = new SolidityProxy(traceManager, codeManager);
let callTree = new InternalCallTree(event, traceManager, solidityProxy, codeManager, { includeLocalVariables: true });
let sourceMappingDecoder = new SourceMappingDecoder();

// get .sol file
const inputFile = process.argv[2];
const inputContents = fs.readFileSync(inputFile).toString();
const compilationResult = solc.compile(inputContents, 0);
const lineBreakPositions = sourceMappingDecoder.getLinebreakPositions(inputContents);
const sourceMap = compilationResult.contracts[":DebugContract"].srcmapRuntime;

let monitoredAddresses = [];

codeManager.event.register('changed', this, (code, address, instIndex) => {
  console.log("codeManager.changed(" + code + ", " + address + ", " + instIndex + ")");
  callTree.sourceLocationTracker.getSourceLocationFromVMTraceIndex(address, currentStepIndex, solidityProxy.contracts, (error, sourceLocation) => {
    console.log("getSourceLocationFromVMTraceIndex.callback(" + error + ", " + sourceLocation + ")");
    if (!error) {
      event.trigger('sourceLocationChanged', [sourceLocation]);
    }
  })
});

const web3ProviderType = "INTERNAL";
web3Providers.addProvider(web3ProviderType);
event.trigger("providerAdded", [web3ProviderType]);
web3Providers.get(web3ProviderType, function (error, obj) {
  if (error) {
    console.log('provider ' + web3ProviderType + ' not defined');
  } else {
    GlobalRemixUtil.web3 = obj;
    event.trigger('providerChanged', [web3ProviderType]);
  }
});
solidityProxy.reset(compilationResult);


let client = new net.Socket();
client.connect(8455, "localhost", () => {
  console.log("connected");
});

client.on("data", (data) => {
  data = CircularJSON.parse(data);
  const triggerType = data.triggerType;

  if (triggerType == "step") {
    // step through code
    const pc = data.content.pc;
    const address = data.content.address;
    
    /*if (monitoredAddresses.indexOf(address) < 0) {
      const response = {
        "status": "error",
        "id": data.id,
        "messageType": "response",
        "content": "address not monitored"
      };
      client.write(CircularJSON.stringify(response));
      return;
    }*/

    // get line number from pc
    console.log(pc);
    const sourceLocation = sourceMappingDecoder.atIndex(pc, sourceMap);
    const currentLocation = sourceMappingDecoder.convertOffsetToLineColumn(sourceLocation, lineBreakPositions);

    const response = {
      "status": "ok",
      "id": data.id,
      "messageType": "response",
      "content": null
    };
    client.write(CircularJSON.stringify(response));
  }
  else if (triggerType == "monitoredAddressesChanged") {
    // addresses changed
    monitoredAddresses = data.content;
    
    const response = {
      "status": "ok",
      "id": data.id,
      "messageType": "response",
      "content": null
    };
    client.write(CircularJSON.stringify(response));
  }
});