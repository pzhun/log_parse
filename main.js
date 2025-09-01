import ParseLog from "./src/parseLog.js";

const options = {
  serviceName: "fx-wallet-service",
  // isParseDevice: true,
  isParseApiStatus: true,
  // isParseErrorInfo: true,
};
const parseLog = new ParseLog(options);
parseLog.init();

parseLog.start("2025-07-28");
