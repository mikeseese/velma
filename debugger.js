const uuidv4 = require("uuid/v4");
const net = require("net");
const CircularJSON = require("circular-json");
const fs = require("fs");
const solc = require("solc");

const SourceMappingDecoder = require("../remix/src/util/sourceMappingDecoder");
let sourceMappingDecoder = new SourceMappingDecoder();

// get .sol file
const inputFile = process.argv[2];
const inputContents = fs.readFileSync(inputFile).toString();
const compilationResult1 = solc.compile(inputContents, 0);
const sourceMap = compilationResult1.contracts[":DebugContract"].srcmapRuntime;
const decompressedSourceMap = sourceMappingDecoder.decompressAll(sourceMap);

let client = new net.Socket();
client.connect(8455, "localhost", () => {
  console.log("connected");
});

client.on("data", (data) => {
  data = CircularJSON.parse(data);
  const response = {
    "id": data.id,
    "type": "response",
    "content": null
  };
  client.write(CircularJSON.stringify(response));
});