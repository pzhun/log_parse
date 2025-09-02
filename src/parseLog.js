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
    const analysisFileName = `error-analysis-${date}.json`;
    const outputData = [];
    const errors = [];

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

    // 分析错误信息
    this.analyzeErrors(outputData, date, savePath, analysisFileName);
  }

  // 分析错误信息
  analyzeErrors(errorLines, date, savePath, analysisFileName) {
    let currentError = null;
    let errorBlock = [];
    const errors = [];
    
    for (let i = 0; i < errorLines.length; i++) {
      const line = errorLines[i].trim();
      
      // 检查是否开始新的错误块
      if (line.includes('Error Details:') || line.includes('Error:') || line.includes('AxiosError:')) {
        // 处理之前的错误块
        if (currentError && errorBlock.length > 0) {
          this.processErrorBlock(currentError, errorBlock);
          errors.push(currentError);
        }
        
        // 开始新的错误块
        currentError = {
          coin: '',
          timestamp: '',
          message: '',
          details: {}
        };
        errorBlock = [];
      }
      
      // 收集错误信息
      if (currentError) {
        errorBlock.push(line);
        
        // 提取关键信息
        this.extractErrorInfo(currentError, line);
        
        // 检查是否到达错误信息的结尾
        if (line === '' || line === ']' || (i < errorLines.length - 1 && errorLines[i + 1].includes('Error Details:'))) {
          if (errorBlock.length > 0) {
            this.processErrorBlock(currentError, errorBlock);
            errors.push(currentError);
          }
          currentError = null;
          errorBlock = [];
        }
      }
    }
    
    // 处理最后一个错误块
    if (currentError && errorBlock.length > 0) {
      this.processErrorBlock(currentError, errorBlock);
      errors.push(currentError);
    }
    
    // 生成分析报告
    this.generateErrorAnalysis(errors, date, savePath, analysisFileName);
  }

  // 提取错误信息
  extractErrorInfo(error, line) {
    if (line.includes('Coin:')) {
      error.coin = line.split('Coin:')[1]?.trim() || '';
    }
    
    if (line.includes('Timestamp:')) {
      error.timestamp = line.split('Timestamp:')[1]?.trim() || '';
    }
    
    if (line.includes('Message:')) {
      error.message = line.split('Message:')[1]?.trim() || '';
    }
  }

  // 处理错误块
  processErrorBlock(error, errorLines) {
    // 只保留包含 axios 相关信息的错误
    const hasAxiosContent = errorLines.some(line => 
      line.includes('AxiosError:') || 
      line.includes('axios') || 
      line.includes('ENOTFOUND') || 
      line.includes('status code') ||
      line.includes('getaddrinfo') ||
      line.includes('ECONNREFUSED') ||
      line.includes('timeout')
    );
    
    if (hasAxiosContent) {
      // 提取详细信息
      error.details = this.extractErrorDetails(errorLines);
    }
  }

  // 提取错误详细信息
  extractErrorDetails(errorLines) {
    const details = {};
    
    errorLines.forEach(line => {
      // 提取 HTTP 状态码
      if (line.includes('status code')) {
        const match = line.match(/status code (\d+)/);
        if (match) {
          details.statusCode = match[1];
        }
      }
      
      // 提取错误类型
      if (line.includes('ENOTFOUND')) {
        details.errorType = 'DNS Resolution Failed';
        details.host = line.match(/getaddrinfo ENOTFOUND ([^\s]+)/)?.[1] || '';
      } else if (line.includes('ECONNREFUSED')) {
        details.errorType = 'Connection Refused';
      } else if (line.includes('timeout')) {
        details.errorType = 'Timeout';
      } else if (line.includes('status code')) {
        details.errorType = 'HTTP Error';
      }
      
      // 提取 API 端点信息
      if (line.includes('GET ') || line.includes('POST ')) {
        const match = line.match(/(GET|POST)\s+([^\s]+)/);
        if (match) {
          details.method = match[1];
          details.endpoint = match[2];
        }
      }
      
      // 提取更多 URL 相关信息
      if (line.includes('http://') || line.includes('https://')) {
        const urlMatch = line.match(/(https?:\/\/[^\s]+)/);
        if (urlMatch) {
          details.url = urlMatch[1];
        }
      }
      
      // 提取主机名
      if (line.includes('api.') || line.includes('.com') || line.includes('.org') || line.includes('.net')) {
        const hostMatch = line.match(/([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
        if (hostMatch && !details.host) {
          details.host = hostMatch[1];
        }
      }
      
      // 提取 hostname 字段
      if (line.includes('hostname:')) {
        const hostnameMatch = line.match(/hostname:\s*['"]([^'"]+)['"]/);
        if (hostnameMatch && !details.host) {
          details.host = hostnameMatch[1];
        }
      }
      
      // 提取 host 字段
      if (line.includes("'Host:")) {
        const hostMatch = line.match(/Host:\s*([^\s\\]+)/);
        if (hostMatch && !details.host) {
          details.host = hostMatch[1];
        }
      }
      
      // 提取 _currentUrl 字段
      if (line.includes('_currentUrl:')) {
        const urlMatch = line.match(/_currentUrl:\s*['"]([^'"]+)['"]/);
        if (urlMatch && !details.url) {
          details.url = urlMatch[1];
        }
      }
      
      // 提取 url 字段
      if (line.includes('url:')) {
        const urlMatch = line.match(/url:\s*['"]([^'"]+)['"]/);
        if (urlMatch && !details.url) {
          details.url = urlMatch[1];
        }
      }
      
      // 提取 _trailer 中的 URL
      if (line.includes('_trailer:') && line.includes('http')) {
        const urlMatch = line.match(/(https?:\/\/[^\s]+)/);
        if (urlMatch && !details.url) {
          details.url = urlMatch[1];
        }
      }
      
      // 提取更多可能的 URL 模式
      if (line.includes('://') && !details.url) {
        const urlMatch = line.match(/([a-zA-Z]+:\/\/[^\s]+)/);
        if (urlMatch) {
          details.url = urlMatch[1];
        }
      }
    });
    
    return details;
  }

    // 生成错误分析报告
  generateErrorAnalysis(errors, date, savePath, analysisFileName) {
    // 只保存网络请求的错误 URL 信息
    const networkErrors = errors.filter(error => 
      error.details.url && 
      error.details.url !== null && 
      (error.details.url.startsWith('http://') || error.details.url.startsWith('https://'))
    );
    
    const analysisReport = {
      summary: {
        totalErrors: errors.length,
        networkErrors: networkErrors.length,
        byType: {},
        byCoin: {}
      },
      networkErrors: networkErrors.map(error => ({
        coin: error.coin || 'Unknown',
        timestamp: error.timestamp || 'Unknown',
        errorType: error.details.errorType || 'Unknown',
        statusCode: error.details.statusCode || null,
        url: error.details.url,
        host: error.details.host || null,
        endpoint: error.details.endpoint || null,
        method: error.details.method || null,
        message: error.message || 'N/A'
      }))
    };
    
    // 计算分组统计
    analysisReport.networkErrors.forEach(error => {
      // 按类型分组
      const errorType = error.errorType;
      if (!analysisReport.summary.byType[errorType]) {
        analysisReport.summary.byType[errorType] = 0;
      }
      analysisReport.summary.byType[errorType]++;
      
      // 按币种分组
      const coin = error.coin;
      if (!analysisReport.summary.byCoin[coin]) {
        analysisReport.summary.byCoin[coin] = 0;
      }
      analysisReport.summary.byCoin[coin]++;
    });
    
    // 保存分析报告
    fs.writeFileSync(
      `${savePath}/${analysisFileName}`,
      JSON.stringify(analysisReport, null, 2)
    );
  }
}

export default ParseLog;
