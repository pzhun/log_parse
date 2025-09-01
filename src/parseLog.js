import fs from "fs";

class ParseLog {
  constructor(options) {
    this.serviceName = options.serviceName;
    this.isParseDevice = options.isParseDevice || false;
    this.isParseApiStatus = options.isParseApiStatus || false;
    this.isParseErrorInfo = options.isParseErrorInfo || false;
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

    // 创建api-status目录
    if (!fs.existsSync(`${this.processedLogsDir}/api-status`)) {
      fs.mkdirSync(`${this.processedLogsDir}/api-status`);
    }
    // 创建error-info目录
    if (!fs.existsSync(`${this.processedLogsDir}/error-info`)) {
      fs.mkdirSync(`${this.processedLogsDir}/error-info`);
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

    if (this.isParseApiStatus) {
      this.parseApiStatus(logs, date);
    }

    if (this.isParseErrorInfo) {
      this.parseErrorInfo(logs, date);
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

  // 统计api的访问的code数量，统计每个code的访问次数
  parseApiStatus(logs, date) {
    const savePath = `${this.processedLogsDir}/api-status`;
    const apiStatusMap = {};
    const logFileName = `api-status-${date}.json`;
    const outputData = [];

    logs.forEach((log) => {
      const content = fs.readFileSync(
        `${this.originalLogsDir}/${log}`,
        "utf-8"
      );
      // 或者是后一天的
      const nextDay = new Date(`${date} 00:00:00`);
      nextDay.setDate(nextDay.getDate() + 1);
      // 筛选日期为开头的或者后一天的
      const filterContent = content
        .split("\n")
        .filter(
          (line) =>
            line.startsWith(date) || line.startsWith(nextDay.toISOString())
        )
        .map((line) => line.replace(/\[user-agent:.*$/, ""));
      outputData.push(...filterContent);
    });
    // 提取出log中的接口名与code GET /wallet/arbitrum/balance 200
    outputData.forEach((line) => {
      const params = line.split(" ");

      if (params.length > 2 && params[2] == "info:") {
        if (params.length > 10) {
          const apiData = params[4].split("?");
          const apiName = params[3] + "_" + apiData[0];
          const code = params[5];
          if (code !== "-") {
            if (apiStatusMap[apiName]) {
              apiStatusMap[apiName][code] =
                (apiStatusMap[apiName][code] || 0) + 1;
              apiStatusMap[apiName].count += 1;
            } else {
              apiStatusMap[apiName] = {
                count: 1,
              };
              apiStatusMap[apiName][code] = 1;
            }
          }
        }
      }
    });
    const apiStatusList = [];
    for (const apiName in apiStatusMap) {
      if (apiStatusMap[apiName].count === 1) continue;
      const apiStatus = apiStatusMap[apiName];
      const apiStatusItem = {
        apiName: apiName,
        apiStatus: apiStatus,
        count: apiStatusMap[apiName].count,
      };
      apiStatusList.push(apiStatusItem);
    }

    apiStatusList.sort((a, b) => b.count - a.count);

    // 保存数据
    fs.writeFileSync(
      `${savePath}/${logFileName}`,
      JSON.stringify(apiStatusList, null, 2)
    );
  }

  // 统计报错信息
  parseErrorInfo(logs, date) {
    const savePath = `${this.processedLogsDir}/error-info`;
    const errorInfoMap = {};

    const logFileName = `error-info-${date}.json`;
    const outputData = [];

    logs.forEach((log) => {
      const content = fs.readFileSync(
        `${this.originalLogsDir}/${log}`,
        "utf-8"
      );
      const nextDay = new Date(`${date} 00:00:00`);
      nextDay.setDate(nextDay.getDate() - 1);
      let month = nextDay.getMonth() + 1;
      if (month < 10) {
        month = `0${month}`;
      }
      let day = nextDay.getDate();
      if (day < 10) {
        day = `0${day}`;
      }
      const nextDayString = `${nextDay.getFullYear()}-${month}-${day}`;
      const filterContent = content
        .split("\n")
        .filter(
          (line) => !line.startsWith(date) && !line.startsWith(nextDayString)
        );
      outputData.push(...filterContent);
    });

    // 保存outputData
    fs.writeFileSync(
      `${savePath}/${logFileName}`,
      JSON.stringify(outputData, null, 2)
    );
  }
}

export default ParseLog;
