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
  async start(date) {
    // 获取log目录下的日志文件

    const logs = fs
      .readdirSync(this.originalLogsDir)
      .filter((log) => log.includes(this.serviceName) && log.includes(date));

    console.log(logs);

    if (this.isParseDevice) {
      const deviceMap = this.parseDevice(logs, date);
      const fileName = `device-${date}.json`;
      // 尝试读取, 如果不存在则创建
      let fileContent = {};
      try {
        fileContent = JSON.parse(fs.readFileSync(fileName, "utf-8"));
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

  parseDevice(logs, date) {
    const deviceMap = {};

    const fileName = `log-${date}.json`;
    const outputData = [];

    // 处理每个日志文件
    logs.forEach((log) => {
      const content = fs.readFileSync(`${this.originalLogsDir}/${log}`, "utf-8");

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
      `${this.processedLogsDir}/logs/${fileName}`,
      JSON.stringify(saveData, null, 2)
    );

    return deviceMap;
  }

  parseDeviceMap() {
    // 读取data文件夹下的所有文件
    const files = fs
      .readdirSync(this.processedLogsDir)
      .filter((file) => file.includes("device"))
      .filter((file) => file != "devices");

    // 处理每个文件，得到uuid的数量, 并统计每个uuid的wallet-id的数量
    const deviceMap = {};

    files.forEach((file) => {
      const content = fs.readFileSync(`${this.processedLogsDir}/${file}`, "utf-8");
      const data = JSON.parse(content);
      // key 为日期, 去掉device- 和 .json
      const date = file.replace("device-", "").replace(".json", "");
      // 统计每个uuid的数量
      deviceMap[date] = {
        devices: Object.keys(data).length,
        wallets: Object.values(data).reduce((acc, curr) => {
          return acc + Object.keys(curr).length;
        }, 0),
      };
    });
    return deviceMap;
  }

  parseLogDetail() {
    // 读取data/logs 下的所有文件
    const files = fs.readdirSync(this.processedLogsDir);
    const versionMap = {};
    // 处理每个文件
    files.forEach((file) => {
      // 找出文件中 uuid为空 wallet-id不为空的log, 并记录相关的接口与 version
      const content = fs.readFileSync(`${this.processedLogsDir}/${file}`, "utf-8");
      const data = JSON.parse(content);

      const saveData = data.filter((line) => {
        const params = {};
        const regex = /\[(uuid|wallet-id|version):\s*([^\]]+)\]/g;
        let match;
        while ((match = regex.exec(line)) !== null) {
          const [, key, value] = match;
          if (value !== "N/A" && value !== "null") {
            params[key] = value.trim();
          }
        }
        if (!params.uuid && params["wallet-id"] && params.version) {
          versionMap[params.version] = (versionMap[params.version] || 0) + 1;
        }
        return !params.uuid && params["wallet-id"];
      });
      // 保存数据
      fs.writeFileSync(
        `${this.processedLogsDir}/logs/${fileName}`,
        JSON.stringify(saveData, null, 2)
      );
    });
    console.log(versionMap);
  }
}

export default ParseLog;
