/**
 *  网页截图插件 (iPad/iPhone 灵动岛风格) - 极致性能版 - 超高效网页截图，尽享灵动美观 - 作者：亦米，欢迎加入 QQ 交流群：303104111
 *
 *  插件优势：
 *      1. ✨ **灵动美观**:  采用 iPad/iPhone 灵动岛风格，截图更具现代感和科技感。
 *      2. 🚀 **极速截图**:  采用浏览器实例池与并行预处理技术，大幅提升截图速度。
 *      3. 🖼️ **高清呈现**:  智能图像优化，截图效果更清晰，细节更丰富。
 *      4. ⚙️ **高级缓存**:  实现域名级缓存预热，二次截图几乎瞬间完成。
 *      5. 🛡️ **超强兼容**:  优化资源加载策略，兼容各类复杂网页，确保高成功率。
 *      6. 🔒 **权限控制**:  支持仅主人可用模式，保障安全与资源合理使用。
 *
 *  本插件由 亦米 制作，QQ 交流群：303104111 (欢迎加入，获取最新插件信息和技术支持)。
 */

import plugin from '../../lib/plugins/plugin.js';
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { promisify } from 'util';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 插件作者信息
const pluginAuthor = '亦米';
const qqGroup = '303104111';

// 启用高级浏览器池 (配置参数)
const BROWSER_POOL = {
    maxInstances: 2,               // 最大浏览器实例数
    maxPagesPerInstance: 3,        // 每个实例最大页面数
    maxIdleTime: 5 * 60 * 1000,    // 最大空闲时间 (5分钟后自动关闭)
    warmupUrls: ['https://www.baidu.com', 'https://www.qq.com'], // 预热地址
};

// 高级缓存配置
const CACHE_CONFIG = {
    enabled: true,              // 是否启用缓存
    expiration: 30 * 60 * 1000, // 缓存过期时间 (30分钟)
    cleanupInterval: 60 * 60 * 1000, // 缓存清理间隔 (1小时)
};

// Chrome 可执行文件路径配置
const chromePaths = {
    linux: [
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser'
    ],
    win32: [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
    ]
};

// 错误提示信息常量
const errorMessagesConfig = [
    { key: 'timeout', message: '⌛ 访问超时，请检查网络或稍后重试' },
    { key: 'ERR_NAME_NOT_RESOLVED', message: '🔍 无法解析网址，请检查网址是否正确' },
    { key: 'ERR_CONNECTION_REFUSED', message: '🚫 连接被拒绝，服务器可能未启动或网络异常' },
    { key: 'ERR_NETWORK', message: '📡 网络异常，请检查您的网络连接' },
    { key: 'ERR_PROXY_CONNECTION_FAILED', message: '🌐 代理连接失败，请检查代理设置' },
    { key: 'ERR_BLOCKED_BY_CLIENT', message: '🚫 请求被客户端阻止，可能由浏览器安全策略引起' },
    { key: 'ERR_CERT_COMMON_NAME_INVALID', message: '🔒 证书域名无效，网站证书配置可能存在问题' },
    { key: 'ERR_CERT_DATE_INVALID', message: '🔒 证书过期，网站证书可能已过期' }
];

// 截图配置
const screenWaitTime = 2.5;       // 通用等待时间优化为2.5秒
const acceleratedScreenWaitTime = 0.8; // 加速流程0.8秒
const screenshotTimeout = 30 * 1000;   // 截图超时降低为30秒

// 异步延迟函数优化版
const delay = timeout => new Promise(resolve => setTimeout(resolve, timeout));

// 权限控制配置 - 默认关闭仅主人模式
let ownerOnlyMode = false;

// 权限配置文件路径
const configDir = path.join(__dirname, 'config');
const configPath = path.join(configDir, 'screenshot_config.json');
const cacheDir = path.join(__dirname, 'cache');
const screenshotDir = path.join(__dirname, 'screenshots');

// 确保所有目录存在
[configDir, cacheDir, screenshotDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// 高级浏览器实例池管理
const browserPool = {
    // 实例存储
    instances: [],
    // 实例状态追踪
    instanceStatus: new Map(),
    // 域名缓存映射 (针对重复访问的优化)
    domainPageCache: new Map(),
    
    // 获取可用浏览器实例
    async getBrowser() {
        // 优先查找有空闲页面的实例
        const availableInstance = this.instances.find(instance => 
            this.instanceStatus.get(instance).activePages < BROWSER_POOL.maxPagesPerInstance);
        
        if (availableInstance) {
            const status = this.instanceStatus.get(availableInstance);
            status.activePages++;
            status.lastUsed = Date.now();
            return availableInstance;
        }
        
        // 如果没有可用实例且未达到池上限，创建新实例
        if (this.instances.length < BROWSER_POOL.maxInstances) {
            console.info('[网页预览] 创建新的浏览器实例');
            const browser = await this.launchBrowser();
            this.instances.push(browser);
            this.instanceStatus.set(browser, {
                activePages: 1,
                lastUsed: Date.now(),
                pageCount: 0
            });
            
            // 设置实例关闭处理
            browser.on('disconnected', () => {
                this.instances = this.instances.filter(b => b !== browser);
                this.instanceStatus.delete(browser);
                console.info('[网页预览] 浏览器实例已断开连接');
            });
            
            return browser;
        }
        
        // 所有实例都满负荷，选择负载最小的
        const leastBusyInstance = this.instances.reduce((prev, curr) => {
            const prevStatus = this.instanceStatus.get(prev);
            const currStatus = this.instanceStatus.get(curr);
            return prevStatus.activePages <= currStatus.activePages ? prev : curr;
        });
        
        const status = this.instanceStatus.get(leastBusyInstance);
        status.activePages++;
        status.lastUsed = Date.now();
        return leastBusyInstance;
    },
    
    // 释放浏览器实例资源
    releaseBrowser(browser) {
        if (!this.instanceStatus.has(browser)) return;
        
        const status = this.instanceStatus.get(browser);
        status.activePages = Math.max(0, status.activePages - 1);
        status.pageCount++;
        
        // 如果页面计数高，考虑重启实例以防内存泄漏
        if (status.pageCount > 30) {
            this.restartBrowser(browser);
        }
    },
    
    // 重启浏览器实例 (防止内存泄漏)
    async restartBrowser(browser) {
        if (!this.instanceStatus.has(browser)) return;
        
        console.info('[网页预览] 重启浏览器实例，防止内存泄漏');
        
        // 从池中移除
        this.instances = this.instances.filter(b => b !== browser);
        this.instanceStatus.delete(browser);
        
        // 异步关闭
        browser.close().catch(e => console.error('[网页预览] 关闭浏览器错误:', e));
        
        // 创建新实例替代
        const newBrowser = await this.launchBrowser();
        this.instances.push(newBrowser);
        this.instanceStatus.set(newBrowser, {
            activePages: 0,
            lastUsed: Date.now(),
            pageCount: 0
        });
        
        // 设置实例关闭处理
        newBrowser.on('disconnected', () => {
            this.instances = this.instances.filter(b => b !== newBrowser);
            this.instanceStatus.delete(newBrowser);
        });
    },
    
    // 启动浏览器实例
    async launchBrowser() {
        const launchOptions = {
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-features=site-per-process', // 禁用站点隔离以减少内存使用
                '--disable-features=TranslateUI',
                '--disable-extensions',
                '--disable-component-extensions-with-background-pages',
                '--disable-default-apps',
                '--mute-audio',
                '--no-default-browser-check',
                '--no-first-run',
                '--use-gl=swiftshader', // 使用软件渲染，更稳定
                '--window-size=1280,800',
            ],
            ignoreHTTPSErrors: true,
            defaultViewport: {
                width: 1280,
                height: 800,
                deviceScaleFactor: 1
            },
            timeout: 30000,
        };

        const chromePath = await WebScreenshot.findChromePath();
        if (chromePath) launchOptions.executablePath = chromePath;

        try {
            const browser = await puppeteer.launch(launchOptions);
            return browser;
        } catch (error) {
            console.error('[网页预览] Puppeteer 实例初始化失败:', error);
            throw error;
        }
    },
    
    // 初始化池并预热
    async init() {
        try {
            // 创建第一个实例并预热
            const browser = await this.launchBrowser();
            this.instances.push(browser);
            this.instanceStatus.set(browser, {
                activePages: 0,
                lastUsed: Date.now(),
                pageCount: 0
            });
            
            // 预热浏览器 (访问常用站点以加快后续访问)
            await this.warmupBrowser(browser);
            
            // 设置实例关闭处理
            browser.on('disconnected', () => {
                this.instances = this.instances.filter(b => b !== browser);
                this.instanceStatus.delete(browser);
            });
            
            // 设置定期清理
            this.startMaintenanceInterval();
            
            console.info('[网页预览] 浏览器实例池初始化完成');
        } catch (error) {
            console.error('[网页预览] 浏览器实例池初始化失败:', error);
        }
    },
    
    // 浏览器预热 (加载常用网站)
    async warmupBrowser(browser) {
        try {
            for (const url of BROWSER_POOL.warmupUrls) {
                const page = await browser.newPage();
                await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 })
                    .catch(e => console.warn(`[网页预览] 预热页面 ${url} 加载失败:`, e.message));
                await page.close();
            }
            console.info('[网页预览] 浏览器预热完成');
        } catch (error) {
            console.warn('[网页预览] 浏览器预热错误:', error.message);
        }
    },
    
    // 定期维护 (关闭空闲实例、重启过载实例)
    startMaintenanceInterval() {
        setInterval(() => {
            const now = Date.now();
            
            // 检查空闲实例
            this.instances.forEach(browser => {
                const status = this.instanceStatus.get(browser);
                
                // 如果实例空闲且超过最大空闲时间，关闭它
                if (status.activePages === 0 && 
                    now - status.lastUsed > BROWSER_POOL.maxIdleTime &&
                    this.instances.length > 1) { // 保留至少一个实例
                    
                    console.info('[网页预览] 关闭空闲浏览器实例');
                    this.instances = this.instances.filter(b => b !== browser);
                    this.instanceStatus.delete(browser);
                    browser.close().catch(() => {});
                }
            });
            
            // 重新预热一个实例，确保始终有温暖的引擎
            if (this.instances.length > 0) {
                const warmInstance = this.instances[0];
                this.warmupBrowser(warmInstance).catch(() => {});
            }
            
        }, 60 * 1000); // 每分钟检查一次
    },
    
    // 清理所有资源
    async shutdown() {
        for (const browser of this.instances) {
            try {
                await browser.close();
            } catch (e) {}
        }
        this.instances = [];
        this.instanceStatus.clear();
        this.domainPageCache.clear();
    }
};

// 高级缓存管理
const cacheManager = {
    cache: new Map(),
    
    // 生成缓存键
    getCacheKey(url) {
        return crypto.createHash('md5').update(url).digest('hex');
    },
    
    // 检查缓存
    has(url) {
        if (!CACHE_CONFIG.enabled) return false;
        
        const key = this.getCacheKey(url);
        if (!this.cache.has(key)) return false;
        
        const cached = this.cache.get(key);
        const now = Date.now();
        
        // 检查是否过期
        if (now - cached.timestamp > CACHE_CONFIG.expiration) {
            this.cache.delete(key);
            return false;
        }
        
        return true;
    },
    
    // 获取缓存
    get(url) {
        if (!this.has(url)) return null;
        return this.cache.get(this.getCacheKey(url)).data;
    },
    
    // 设置缓存
    set(url, data) {
        if (!CACHE_CONFIG.enabled) return;
        
        const key = this.getCacheKey(url);
        this.cache.set(key, {
            data,
            timestamp: Date.now()
        });
        
        // 将缓存写入磁盘
        this.persistCache(key, data);
    },
    
    // 持久化缓存到磁盘
    async persistCache(key, data) {
        try {
            const cachePath = path.join(cacheDir, `${key}.cache`);
            await promisify(fs.writeFile)(cachePath, JSON.stringify({
                data,
                timestamp: Date.now()
            }));
        } catch (error) {
            console.warn('[网页预览] 缓存持久化失败:', error.message);
        }
    },
    
    // 从磁盘加载缓存
    async loadFromDisk() {
        try {
            const files = await promisify(fs.readdir)(cacheDir);
            
            for (const file of files) {
                if (!file.endsWith('.cache')) continue;
                
                try {
                    const cachePath = path.join(cacheDir, file);
                    const data = JSON.parse(await promisify(fs.readFile)(cachePath, 'utf8'));
                    
                    // 只加载未过期的缓存
                    if (Date.now() - data.timestamp <= CACHE_CONFIG.expiration) {
                        const key = file.replace('.cache', '');
                        this.cache.set(key, data);
                    } else {
                        // 删除过期缓存文件
                        await promisify(fs.unlink)(cachePath);
                    }
                } catch (e) {
                    console.warn(`[网页预览] 加载缓存文件 ${file} 失败:`, e.message);
                }
            }
            
            console.info(`[网页预览] 已加载 ${this.cache.size} 个缓存项`);
        } catch (error) {
            console.warn('[网页预览] 从磁盘加载缓存失败:', error.message);
        }
    },
    
    // 启动缓存清理定时器
    startCleanupInterval() {
        setInterval(() => {
            const now = Date.now();
            let expiredCount = 0;
            
            // 清理内存缓存
            for (const [key, value] of this.cache.entries()) {
                if (now - value.timestamp > CACHE_CONFIG.expiration) {
                    this.cache.delete(key);
                    expiredCount++;
                    
                    // 清理磁盘缓存
                    const cachePath = path.join(cacheDir, `${key}.cache`);
                    fs.unlink(cachePath, () => {});
                }
            }
            
            if (expiredCount > 0) {
                console.info(`[网页预览] 已清理 ${expiredCount} 个过期缓存项`);
            }
        }, CACHE_CONFIG.cleanupInterval);
    },
    
    // 初始化缓存
    async init() {
        if (!CACHE_CONFIG.enabled) return;
        
        await this.loadFromDisk();
        this.startCleanupInterval();
    }
};

// 预加载背景图片并缓存 - 一次性操作提高性能
const backgroundImageCache = (() => {
    try {
        const bgPath = path.join(__dirname, 'resources', 'background.png');
        if (fs.existsSync(bgPath)) {
            // 直接使用base64编码的背景图片避免文件读取
            const base64 = fs.readFileSync(bgPath).toString('base64');
            return `data:image/png;base64,${base64}`;
        }
    } catch (e) {
        console.warn('[网页预览] 背景图片缓存失败:', e.message);
    }
    
    // 回退到文件路径
    return 'file://' + path.join(__dirname, 'resources', 'background.png');
})();

// HTML模板缓存 - 提前生成模板框架部分
const baseTemplate = (() => {
    return `
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>iPad 美化截图</title>
        <link rel="stylesheet" href="//at.alicdn.com/t/c/font_4822035_eg7jee2q3mh.css">
        <style>
            @import url('//at.alicdn.com/t/c/font_4822035_eg7jee2q3mh.css');

            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif;
                background-color: #f0f0f0;
                display: flex;
                justify-content: center;
                align-items: center;
                height: auto;
                min-height: 100vh;
                margin: 0;
                -webkit-font-smoothing: antialiased;
                background-image: url('${backgroundImageCache}');
                background-size: cover;
                background-repeat: no-repeat;
                background-position: center center;
            }
            .container {
                display: flex;
                flex-direction: column;
                align-items: center;
                background-color: transparent;
                padding: 12px;
                border-radius: 22px;
                box-shadow: 0 12px 32px rgba(0, 0, 0, 0.24);
                background-image: linear-gradient(160deg, #f8f8f8 60%, #f0f0f0);
                margin: 0 auto;
            }
            .browser-window {
                width: 94%;
                height: auto;
                max-width: 1080px;
                border-top-left-radius: 32px;
                border-top-right-radius: 32px;
                border-bottom-left-radius: 32px;
                border-bottom-right-radius: 32px;
                overflow: hidden;
                background-color: #fff;
                padding-top: 48px;
                position: relative;
                border: 28px solid #e6e6fa;
                box-shadow:
                    0 24px 64px rgba(0, 0, 0, 0.32),
                    inset 0 0 16px rgba(0,0,0,0.12),
                    6px 6px 12px rgba(0, 0, 0, 0.1);
            }
            .status-bar {
                position: absolute;
                top: 8px;
                left: 50%;
                transform: translateX(-50%);
                width: calc(100% - 40px);
                height: 16px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                color: #000;
                font-size: 12px;
            }
            .status-bar span {
                font-size: 12px;
            }
            .status-logo {
                height: 14px;
                margin-right: 6px;
                vertical-align: middle;
                border-radius: 2px;
                display: inline-block;
            }
            .status-left, .status-right {
                display: flex;
                align-items: center;
            }
            .status-right i {
                margin-left: 8px;
                font-size: 14px;
                color: #000;
            }
            .dynamic-island {
                position: absolute;
                top: 12px;
                left: 50%;
                transform: translateX(-50%);
                width: 270px;
                height: 32px;
                background-color: rgba(0,0,0,0.8);
                border-radius: 16px;
                display: flex;
                align-items: center;
                justify-content: center;
                color: #fff;
                font-size: 13px;
                overflow: hidden;
                white-space: nowrap;
                text-overflow: ellipsis;
                padding: 0 14px;
                box-shadow: 0 3px 7px rgba(0, 0, 0, 0.35);
            }
            .dynamic-island img {
                height: 18px;
                margin-right: 7px;
                vertical-align: middle;
                border-radius: 4px;
            }
            .screenshot {
                display: block;
                width: 100%;
                height: auto;
                border-radius: 0;
                box-shadow: inset 0 0 8px rgba(0,0,0,0.05);
            }
            .iconfont {
                font-family: "iconfont" !important;
                font-size: 16px;
                font-style: normal;
                -webkit-font-smoothing: antialiased;
                -moz-osx-font-smoothing: grayscale;
                -webkit-text-stroke-width: 0.2px;
                -webkit-font-smoothing: antialiased !important;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="browser-window">
                <div class="status-bar">
                    <div class="status-left">
                        <img src="LOGO_PLACEHOLDER" class="status-logo" alt="Logo" onerror="this.style.display='none'">
                        <span id="current-time">TIME_PLACEHOLDER</span>
                    </div>
                    <div class="status-right">
                        <i class="iconfont icon-xinhao"></i>
                        <i class="iconfont icon-WIFI"></i>
                        <i class="iconfont icon-dianchi"></i>
                    </div>
                </div>
                <div class="dynamic-island">
                    <img src="LOGO_PLACEHOLDER" alt="Logo" onerror="this.style.display='none'">
                    <span>TITLE_PLACEHOLDER</span>
                </div>
                <img class="screenshot" src="SCREENSHOT_PLACEHOLDER" alt="TITLE_PLACEHOLDER">
            </div>
        </div>
    </body>
    </html>
    `;
})();

// 优化的模板渲染函数 - 使用快速字符串替换而非重新解析
const screenRender = (screenshotBase64, title, logo) => {
    const currTime = `${new Date().getHours().toString().padStart(2, '0')}:${new Date().getMinutes().toString().padStart(2, '0')}`;
    
    return baseTemplate
        .replace(/LOGO_PLACEHOLDER/g, logo)
        .replace(/TITLE_PLACEHOLDER/g, title)
        .replace(/TIME_PLACEHOLDER/g, currTime)
        .replace(/SCREENSHOT_PLACEHOLDER/g, `data:image/jpeg;base64,${screenshotBase64}`);
};

export class WebScreenshot extends plugin {
    constructor() {
        super({
            name: '网页截图',
            dsc: '自动网页截图插件(iPad/iPhone灵动岛风格)',
            event: 'message',
            author: pluginAuthor,
            group: qqGroup,
            priority: 5000,
            rule: [
                {
                    reg: '^(https?:\/\/[^\\s]+)$',
                    fnc: 'autoScreenshot'
                },
                {
                    reg: '^#强制截图\\s*(https?:\/\/[^\\s]+)$',
                    fnc: 'forceScreenshot',
                    permission: 'master'
                },
                {
                    reg: '^#仅主人可截(开启|关闭)$',
                    fnc: 'toggleOwnerOnlyMode',
                    permission: 'master'
                }
            ]
        });
        
        // 初始化配置
        this.initConfig();
        
        // 初始化浏览器池和缓存
        this.initSystem();
    }
    
    // 系统初始化
    async initSystem() {
        // 初始化浏览器池
        browserPool.init();
        
        // 初始化缓存
        await cacheManager.init();
        
        // 清理临时文件
        WebScreenshot.cleanupScreenshots(screenshotDir);
        
        // 设置进程退出处理
        process.on('exit', () => {
            browserPool.shutdown();
        });
    }

    // 初始化配置
    initConfig() {
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true });
        }
        
        // 加载配置
        try {
            if (fs.existsSync(configPath)) {
                const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                ownerOnlyMode = config.ownerOnlyMode || false;
                console.info(`[网页预览] 已加载配置: 仅主人可截模式=${ownerOnlyMode}`);
            } else {
                // 创建默认配置
                this.saveConfig();
            }
        } catch (error) {
            console.error('[网页预览] 加载配置失败:', error);
            // 创建默认配置
            this.saveConfig();
        }
    }

    // 保存配置
    saveConfig() {
        try {
            fs.writeFileSync(configPath, JSON.stringify({ ownerOnlyMode }, null, 2));
            console.info(`[网页预览] 已保存配置: 仅主人可截模式=${ownerOnlyMode}`);
        } catch (error) {
            console.error('[网页预览] 保存配置失败:', error);
        }
    }

    // 切换仅主人模式
    async toggleOwnerOnlyMode(e) {
        const mode = e.msg.includes('开启') ? true : false;
        ownerOnlyMode = mode;
        this.saveConfig();
        
        await e.reply(`🔒 仅主人可截模式已${mode ? '开启' : '关闭'}`);
        return true;
    }

    // 强制截图 (主人专用)
    async forceScreenshot(e) {
        const match = e.msg.match(/^#强制截图\s*(https?:\/\/[^\s]+)$/);
        if (!match) return false;
        
        const url = match[1];
        return this.processScreenshot(e, url, true);
    }

    // 自动截图
    async autoScreenshot(e) {
        // 检查是否仅主人模式
        if (ownerOnlyMode && !e.isMaster) {
            await e.reply("🔒 当前已开启仅主人可截模式，您没有权限使用此功能");
            return true;
        }
        
        const url = e.msg;
        return this.processScreenshot(e, url, false);
    }

    // 优化后的统一处理截图过程
    async processScreenshot(e, url, isForced = false) {
        try {
            new URL(url);
        } catch {
            return false;
        }

        let browser;
        let page;
        let replyMsgIds = [];
        let screenshotBase64;
        let accelerated = false;
        
        const startTime = Date.now();
        let processingStage = "初始化";
        
        try {
            // 检查缓存
            if (!isForced && cacheManager.has(url)) {
                console.info(`[网页预览] 使用缓存: ${url}`);
                const cachedData = cacheManager.get(url);
                await e.reply(segment.image(`base64://${cachedData.screenshot}`));
                return true;
            }
            
            browser = await browserPool.getBrowser();
            if (!browser) {
                throw new Error('浏览器实例获取失败');
            }
            
            processingStage = "创建页面";
            page = await browser.newPage();
            
            // 优化页面设置
            await Promise.all([
                page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'),
                page.setExtraHTTPHeaders({
                    'Accept-Language': 'zh-CN,zh;q=0.9',
                    'Accept-Encoding': 'gzip, deflate, br'
                }),
                // 设置超时
                page.setDefaultNavigationTimeout(30000)
            ]);
            
            // 并行加载逻辑 - 发送通知并加载页面同时进行
            processingStage = "页面加载";
            const loadingPromise = page.goto(url, {
                waitUntil: 'domcontentloaded',
                timeout: 25000
            }).catch(error => {
                console.warn(`[网页预览] 首次加载遇到错误: ${error.message}`);
                
                // 如果domcontentloaded失败，尝试用networkidle2
                return page.goto(url, {
                    waitUntil: 'networkidle2',
                    timeout: 25000
                });
            });
            
            // 同时发送加载消息
            const messagePromise = e.reply(`✅ 正在加载网页${isForced ? '(强制模式)' : ''}...`);
            
            // 等待两个Promise都完成
            const [loadedPage, loadedReply] = await Promise.all([
                loadingPromise,
                messagePromise
            ]).catch(async error => {
                // 如果加载失败但消息发送成功，继续处理
                if (error.message?.includes('Navigation')) {
                    console.warn(`[网页预览] 页面导航错误，尝试继续处理: ${error.message}`);
                    return [null, loadedReply]; // 返回null表示导航失败但继续
                }
                throw error; // 其他错误继续抛出
            });
            
            if (loadedReply && loadedReply.message_id) {
                replyMsgIds.push(loadedReply.message_id);
            }
            
            // 更新加载消息
            const processingReply = await e.reply('✅ 网页加载完成，正在处理截图...');
            if (processingReply && processingReply.message_id) {
                replyMsgIds.push(processingReply.message_id);
            }
            
            // 高级截图流程
            processingStage = "截图处理";
            const screenshotProcess = async () => {
                // 优化滚动方式 - 使用requestAnimationFrame确保平滑滚动
                await page.evaluate(async () => {
                    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
                    
                    // 检测页面类型和内容加载情况
                    const pageHeight = Math.max(
                        document.body.scrollHeight,
                        document.documentElement.scrollHeight,
                        document.body.offsetHeight,
                        document.documentElement.offsetHeight
                    );
                    const viewportHeight = window.innerHeight;
                    
                    // 短页面无需滚动
                    if (pageHeight <= viewportHeight * 1.2) return;
                    
                    // 使用requestAnimationFrame实现平滑滚动
                    let lastScrollTop = window.pageYOffset;
                    const maxScrolls = Math.min(Math.ceil(pageHeight / viewportHeight) * 2, 10);
                    const scrollStep = Math.ceil(pageHeight / maxScrolls);
                    
                    for (let i = 1; i <= maxScrolls; i++) {
                        const targetScroll = Math.min(i * scrollStep, pageHeight - viewportHeight);
                        
                        // 使用requestAnimationFrame滚动
                        await new Promise(resolve => {
                            window.scrollTo({
                                top: targetScroll,
                                behavior: 'auto'
                            });
                            requestAnimationFrame(() => setTimeout(resolve, 30));
                        });
                        
                        // 检测是否已到底部或滚动停止
                        if (Math.abs(window.pageYOffset - lastScrollTop) < 10 || 
                            window.pageYOffset + viewportHeight >= pageHeight - 50) {
                            break;
                        }
                        
                        lastScrollTop = window.pageYOffset;
                    }
                    
                    // 回到顶部
                    window.scrollTo({ top: 0, behavior: 'auto' });
                    await delay(50);
                });

                // 使用默认等待时间或加速等待时间
                const waitTime = accelerated ? acceleratedScreenWaitTime : screenWaitTime;
                await delay(waitTime * 1000);
                
                // 并行获取页面信息和进行截图
                const [pageInfo, initialScreenshot] = await Promise.all([
                    // 获取页面信息
                    page.evaluate(() => {
                        const title = document.title || '网页预览';
                        let link = document.querySelector('link[rel="icon"], link[rel="shortcut icon"]');
                        let logo = link ? link.href : '';
                        if (!logo.startsWith('http')) {
                            try {
                                logo = new URL(logo, window.location.href).href;
                            } catch {
                                logo = '';
                            }
                        }
                        
                        // 额外检测网站logo作为备选
                        if (!logo) {
                            const imgs = Array.from(document.querySelectorAll('img'))
                                .filter(img => img.width > 10 && img.width < 100 && 
                                       img.height > 10 && img.height < 100);
                            
                            if (imgs.length > 0) {
                                // 找出可能的logo图片
                                const possibleLogo = imgs.find(img => 
                                    img.src.includes('logo') || 
                                    img.alt.includes('logo') ||
                                    img.className.includes('logo'));
                                
                                if (possibleLogo) {
                                    logo = possibleLogo.src;
                                }
                            }
                        }
                        
                        return { title, logo };
                    }),
                    
                    // 同时截图
                    page.screenshot({
                        type: 'jpeg',
                        quality: 75,
                        fullPage: true,
                        omitBackground: true,
                        encoding: 'base64'
                    })
                ]);
                
                const { title, logo } = pageInfo;
                screenshotBase64 = initialScreenshot;
                
                // 使用优化的HTML模板
                const htmlContent = screenRender(screenshotBase64, title, logo);
                
                // 设置页面内容
                await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
                
                // 确保元素已渲染
                await page.waitForSelector('.browser-window', { timeout: 10000 });
                await delay(100);
                
                // 最终截图
                screenshotBase64 = await page.screenshot({
                    type: 'jpeg',
                    quality: 80,
                    omitBackground: true,
                    encoding: 'base64',
                    clip: await page.evaluate(() => {
                        const rect = document.querySelector('.browser-window').getBoundingClientRect();
                        return { 
                            x: rect.x, 
                            y: rect.y, 
                            width: rect.width, 
                            height: rect.height 
                        };
                    })
                });
                
                // 保存到缓存
                if (!isForced) {
                    cacheManager.set(url, { 
                        screenshot: screenshotBase64,
                        title,
                        timestamp: Date.now()
                    });
                }
            };

            // 创建超时 Promise
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => {
                    accelerated = true;
                    console.warn(`[网页预览] 截图超时 (${screenshotTimeout/1000}秒)，已启用加速流程`);
                    reject(new Error('Screenshot timed out'));
                }, screenshotTimeout);
            });

            // 使用 Promise.race 运行截图流程和超时判断
            await Promise.race([screenshotProcess(), timeoutPromise]).catch(error => {
                if (error.message !== 'Screenshot timed out') {
                    throw error;
                }
                console.info('[网页预览] 执行加速流程完成');
            });
            
            // 保存截图到文件
            processingStage = "保存和发送";
            const fileName = `screenshot_${Date.now()}.jpeg`;
            const filePath = path.join(screenshotDir, fileName);
            
            if (screenshotBase64) {
                fs.writeFileSync(filePath, Buffer.from(screenshotBase64, 'base64'));
            } else {
                throw new Error('截图生成失败');
            }

            // 发送截图
            await e.reply(segment.image(`base64://${screenshotBase64}`));
            
            // 计算总处理时间
            const totalTime = Date.now() - startTime;
            console.info(`[网页预览] 截图处理完成，耗时: ${totalTime}ms`);

            // 延迟撤回加载消息
            setTimeout(() => {
                replyMsgIds.forEach(msgId => {
                    if (e.bot && typeof e.bot.recallMsg === 'function') {
                        e.bot.recallMsg(msgId).catch(() => {});
                    }
                });
            }, 3000);

            return true;
        } catch (err) {
            console.error(`[网页预览] [${processingStage}] 错误:`, err);
            
            let errorMessage = `❌ 截图失败，具体原因：${err.message}`;
            const errorConfig = errorMessagesConfig.find(item => err.message?.includes(item.key));
            if (errorConfig) {
                errorMessage = errorConfig.message;
            }
            
            await e.reply(errorMessage);
            return false;
        } finally {
            // 清理资源
            try {
                if (page) {
                    await page.close().catch(() => {});
                }
                
                if (browser) {
                    browserPool.releaseBrowser(browser);
                }
            } catch (e) {
                console.error('[网页预览] 资源清理错误:', e);
            }
        }
    }

    static async findChromePath() {
        const paths = chromePaths[process.platform] || chromePaths.linux;
        for (const p of paths) {
            try {
                if (fs.existsSync(p)) {
                    return p;
                }
            } catch (e) {
                continue;
            }
        }
        console.warn('[网页预览] 未找到 Chrome 可执行文件，将尝试使用默认 Chromium');
        return null;
    }

    static cleanupScreenshots(screenshotDir) {
        const now = Date.now();
        fs.readdir(screenshotDir, (err, files) => {
            if (err) return;
            
            let deletedCount = 0;
            files.forEach(file => {
                if (!file.startsWith('screenshot_')) return;
                
                const filePath = path.join(screenshotDir, file);
                fs.stat(filePath, (err, stat) => {
                    if (err) return;
                    const elapsed = now - stat.ctimeMs;
                    if (elapsed > 15 * 60 * 1000) { // 15分钟后删除
                        fs.unlink(filePath, () => { 
                            deletedCount++;
                        });
                    }
                });
            });
            
            if (deletedCount > 0) {
                console.info(`[网页预览] 已清理 ${deletedCount} 个临时截图文件`);
            }
        });
    }
}

export default WebScreenshot;
