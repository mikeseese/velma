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
const CodeUtils = require('../remix/src/code/codeUtils');

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
const compilationResult = solc.compile(inputContents, 1);

let monitoredContracts = {};

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

  if (triggerType == "monitoredContractsChanged") {
    // addresses changed
    monitoredContracts = data.content;
    
    Object.keys(monitoredContracts).forEach((key) => {
      monitoredContracts[key].pcMap = CodeUtils.nameOpCodes(new Buffer(monitoredContracts[key].bytecode.substring(2), 'hex'))[1];
      monitoredContracts[key].lineBreaks = sourceMappingDecoder.getLinebreakPositions(inputContents);
    });
    
    const response = {
      "status": "ok",
      "id": data.id,
      "messageType": "response",
      "content": null
    };
    client.write(CircularJSON.stringify(response));
  }
  else if (triggerType == "step") {
    // step through code
    const pc = data.content.pc;
    const address = (new Buffer(data.content.address.data)).toString("hex");
    
    if (!(address in monitoredContracts)) {
      console.log("address " + address + " not monitored");
      const response = {
        "status": "error",
        "id": data.id,
        "messageType": "response",
        "content": "address not monitored"
      };
      client.write(CircularJSON.stringify(response));
      return;
    }

    // get line number from pc
    const index = monitoredContracts[address].pcMap[pc];
    const sourceLocation = sourceMappingDecoder.atIndex(index, monitoredContracts[address].sourceMap);
    const currentLocation = sourceMappingDecoder.convertOffsetToLineColumn(sourceLocation, monitoredContracts[address].lineBreaks);

    //console.log(pc + " : " + codePCMap[pc] + " : " + codePCMap[pc + 1]);
    if(currentLocation.start && currentLocation.end) {
      console.log("Start: (" + currentLocation.start.line + " : " + currentLocation.start.column + ")");
      console.log("End: (" + currentLocation.end.line + " : " + currentLocation.end.column + ")");
    }

    const response = {
      "status": "ok",
      "id": data.id,
      "messageType": "response",
      "content": null
    };
    client.write(CircularJSON.stringify(response));
  }
});