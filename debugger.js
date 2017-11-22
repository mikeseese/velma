const uuidv4 = require("uuid/v4");
const net = require("net");
var CircularJSON = require("circular-json");

let client = new net.Socket();
client.connect(8455, "localhost", () => {
  console.log("connected");
});

client.on("data", (data) => {
  data = CircularJSON.parse(data);
  console.log(data);
  const response = {
    "id": data.id,
    "type": "response",
    "content": null
  };
  client.write(CircularJSON.stringify(response));
});