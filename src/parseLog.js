import fs from "fs";

class ParseLog {
  constructor(options) {
    this.serviceName = options.serviceName;
    this.isParseDevice = options.isParseDevice || false;
    // 原始日子目录
    this.originalLogsDir = "..";
    // 处理后的日志目录
    this.processedLogsDir = "./report";
  }

  async init() {
    // 首先创建report目录
    if (!fs.existsSync(this.processedLogsDir)) {
      fs.mkdirSync(this.processedLogsDir);
    }
    // 创建logs目录
    if (!fs.existsSync(`${this.processedLogsDir}/logs`)) {
      fs.mkdirSync(`${this.processedLogsDir}/logs`);
    }
    // 创建devices目录
    if (!fs.existsSync(`${this.processedLogsDir}/devices`)) {
      fs.mkdirSync(`${this.processedLogsDir}/devices`);
    }
  }

  async start(date) {
    // 获取log目录下的日志文件

    const logs = fs
      .readdirSync(this.originalLogsDir)
      .filter((log) => log.includes(this.serviceName) && log.includes(date));

    

    if (this.isParseDevice) {
      this.parseDevice(logs, date);
    }
  }

  parseDevice(logs, date) {
    const deviceMap = {};

    const logFileName = `log-${date}.json`;
    const outputData = [];

    // 处理每个日志文件
    logs.forEach((log) => {
      const content = fs.readFileSync(
        `${this.originalLogsDir}/${log}`,
        "utf-8"
      );

      const filterContent = content
        .split("\n")
        .filter((line) => line.includes(date));

      outputData.push(...filterContent);

      filterContent.forEach((line) => {
        const params = {};
        const regex = /\[(uuid|wallet-id):\s*([^\]]+)\]/g;
        let match;

        // 提取 uuid 和 wallet-id
        while ((match = regex.exec(line)) !== null) {
          const [, key, value] = match;
          if (value !== "N/A" && value !== "null") {
            params[key] = value.trim();
          }
        }

        // 如果同时有 uuid 和 wallet-id，则统计
        if (params.uuid && params["wallet-id"]) {
          const { uuid } = params;
          const walletId = params["wallet-id"];

          if (!deviceMap[uuid]) deviceMap[uuid] = {};
          deviceMap[uuid][walletId] = (deviceMap[uuid][walletId] || 0) + 1;
        }
      });
    });

    // 只保留fxwallet来的请求
    const saveData = outputData.filter((line) =>
      line.includes("[user-agent: FxWallet]")
    );

    // 保存outputData
    fs.writeFileSync(
      `${this.processedLogsDir}/logs/${logFileName}`,
      JSON.stringify(saveData, null, 2)
    );

    const fileName = `device-${date}.json`;
    // 尝试读取, 如果不存在则创建
    let fileContent = {};
    try {
      fileContent = JSON.parse(
        fs.readFileSync(`${this.processedLogsDir}/devices/${fileName}`, "utf-8")
      );
    } catch (error) {
      fileContent = {
        MergeCount: 0,
      };
    }

    // 最多合并两次
    if (fileContent.MergeCount < 1) {
      // 合并数据
      for (const uuid in deviceMap) {
        if (!fileContent[uuid]) {
          fileContent[uuid] = {};
        }
        for (const walletId in deviceMap[uuid]) {
          if (fileContent[uuid] && fileContent[uuid][walletId]) {
            fileContent[uuid][walletId] += deviceMap[uuid][walletId];
          } else {
            fileContent[uuid][walletId] = deviceMap[uuid][walletId];
          }
        }
      }
      fileContent.MergeCount += 1;
      // 将合并后数据写入到文件中
      fs.writeFileSync(
        `${this.processedLogsDir}/devices/${fileName}`,
        JSON.stringify(fileContent, null, 2)
      );
    }
  }
}

export default ParseLog;
