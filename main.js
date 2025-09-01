import ParseLog from "./src/parseLog.js";

const options = {
  serviceName: "fx-wallet-service",
  isParseDevice: true,
};
const parseLog = new ParseLog(options);

parseLog.start("2025-07-27");
