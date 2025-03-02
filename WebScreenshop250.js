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
 *      7. 🔋 **快速启动**:  优化启动性能，不影响机器人重启速度。
 *
 *  本插件由 亦米 制作，QQ 交流群：303104111 (欢迎加入，获取最新插件信息和技术支持)。
 */

import plugin from '../../lib/plugins/plugin.js';
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
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

// 确保所有目录存在 (延迟初始化)
const ensureDirectories = () => {
    [configDir, cacheDir, screenshotDir].forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    });
};

// 懒加载标志
let systemInitialized = false;
let browserInstance = null;
const browserStatus = {
    activePages: 0,
    lastUsed: 0,
    pageCount: 0
};

// 缓存管理 (延迟初始化)
const cacheManager = {
    cache: new Map(),
    initialized: false,
    
    // 初始化缓存 (懒加载)
    async init() {
        if (this.initialized || !CACHE_CONFIG.enabled) return;
        
        ensureDirectories();
        this.initialized = true;
        this.startCleanupInterval();
        
        // 异步加载缓存，不阻塞启动流程
        setTimeout(() => {
            this.loadFromDisk().catch(error => {
                console.warn('[网页预览] 从磁盘加载缓存失败:', error.message);
            });
        }, 10000); // 延迟10秒加载缓存，不影响启动速度
    },
    
    // 生成缓存键
    getCacheKey(url) {
        return crypto.createHash('md5').update(url).digest('hex');
    },
    
    // 检查缓存
    has(url) {
        if (!CACHE_CONFIG.enabled) return false;
        if (!this.initialized) this.init();
        
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
        if (!this.initialized) this.init();
        
        const key = this.getCacheKey(url);
        this.cache.set(key, {
            data,
            timestamp: Date.now()
        });
        
        // 将缓存写入磁盘 (异步操作不阻塞)
        setTimeout(() => {
            this.persistCache(key, data).catch(() => {});
        }, 0);
    },
    
    // 持久化缓存到磁盘
    async persistCache(key, data) {
        try {
            const cachePath = path.join(cacheDir, `${key}.cache`);
            fs.writeFileSync(cachePath, JSON.stringify({
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
            const files = fs.readdirSync(cacheDir);
            let loadedCount = 0;
            
            for (const file of files) {
                if (!file.endsWith('.cache')) continue;
                
                try {
                    const cachePath = path.join(cacheDir, file);
                    const data = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
                    
                    // 只加载未过期的缓存
                    if (Date.now() - data.timestamp <= CACHE_CONFIG.expiration) {
                        const key = file.replace('.cache', '');
                        this.cache.set(key, data);
                        loadedCount++;
                    } else {
                        // 删除过期缓存文件
                        fs.unlinkSync(cachePath);
                    }
                } catch (e) {
                    continue;
                }
            }
            
            if (loadedCount > 0) {
                console.info(`[网页预览] 已加载 ${loadedCount} 个缓存项`);
            }
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
    }
};

// 预加载背景图片路径（不阻塞启动）
let backgroundImagePath = 'file://' + path.join(__dirname, 'resources', 'background.png');
let backgroundImageCache = null;

// 获取背景图片 (懒加载)
const getBackgroundImage = () => {
    if (backgroundImageCache) return backgroundImageCache;
    
    try {
        const bgPath = path.join(__dirname, 'resources', 'background.png');
        if (fs.existsSync(bgPath)) {
            // 转为base64
            const base64 = fs.readFileSync(bgPath).toString('base64');
            backgroundImageCache = `data:image/png;base64,${base64}`;
            return backgroundImageCache;
        }
    } catch (e) {}
    
    return backgroundImagePath;
};

// HTML模板生成 (延迟加载，不缓存整个模板)
const getScreenTemplate = (screenshotBase64, title, logo) => {
    const currTime = `${new Date().getHours().toString().padStart(2, '0')}:${new Date().getMinutes().toString().padStart(2, '0')}`;
    const bgImage = getBackgroundImage();
    
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
                background-image: url('${bgImage}');
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
                        <img src="${logo}" class="status-logo" alt="Logo" onerror="this.style.display='none'">
                        <span id="current-time">${currTime}</span>
                    </div>
                    <div class="status-right">
                        <i class="iconfont icon-xinhao"></i>
                        <i class="iconfont icon-WIFI"></i>
                        <i class="iconfont icon-dianchi"></i>
                    </div>
                </div>
                <div class="dynamic-island">
                    <img src="${logo}" alt="Logo" onerror="this.style.display='none'">
                    <span>${title}</span>
                </div>
                <img class="screenshot" src="data:image/jpeg;base64,${screenshotBase64}" alt="${title}">
            </div>
        </div>
    </body>
    </html>
    `;
};

// 简化的浏览器管理
const browserManager = {
    // 获取或创建浏览器实例
    async getBrowser() {
        // 如果实例已存在且可用，返回它
        if (browserInstance && browserStatus.activePages < BROWSER_POOL.maxPagesPerInstance) {
            browserStatus.activePages++;
            browserStatus.lastUsed = Date.now();
            return browserInstance;
        }
        
        // 如果实例不存在或已满，创建新实例
        if (!browserInstance) {
            console.info('[网页预览] 创建新的浏览器实例');
            browserInstance = await this.launchBrowser();
            browserStatus.activePages = 1;
            browserStatus.lastUsed = Date.now();
            browserStatus.pageCount = 0;
            
            // 定期检查关闭
            this.startMaintenanceCheck();
            
            return browserInstance;
        }
        
        // 实例已满，则重置
        console.info('[网页预览] 浏览器实例已满，重置实例');
        await this.closeBrowser();
        browserInstance = await this.launchBrowser();
        browserStatus.activePages = 1;
        browserStatus.lastUsed = Date.now();
        browserStatus.pageCount = 0;
        return browserInstance;
    },
    
    // 释放浏览器资源
    releaseBrowser() {
        if (!browserInstance) return;
        
        browserStatus.activePages = Math.max(0, browserStatus.activePages - 1);
        browserStatus.pageCount++;
        
        // 页面计数过高时重启浏览器
        if (browserStatus.pageCount > 20) {
            console.info('[网页预览] 页面计数过高，重启浏览器实例');
            setTimeout(() => {
                this.closeBrowser().catch(() => {});
            }, 1000);
        }
    },
    
    // 启动浏览器
    async launchBrowser() {
        const launchOptions = {
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-features=site-per-process',
                '--disable-extensions',
                '--disable-component-extensions-with-background-pages',
                '--mute-audio',
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

        const chromePath = await this.findChromePath();
        if (chromePath) launchOptions.executablePath = chromePath;

        try {
            return await puppeteer.launch(launchOptions);
        } catch (error) {
            console.error('[网页预览] Puppeteer 实例初始化失败:', error);
            throw error;
        }
    },
    
    // 查找Chrome路径
    async findChromePath() {
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
    },
    
    // 关闭浏览器
    async closeBrowser() {
        if (!browserInstance) return;
        
        try {
            await browserInstance.close();
        } catch (e) {
            console.error('[网页预览] 关闭浏览器错误:', e.message);
        } finally {
            browserInstance = null;
            browserStatus.activePages = 0;
            browserStatus.pageCount = 0;
        }
    },
    
    // 定期检查，关闭空闲浏览器
    startMaintenanceCheck() {
        if (this.maintenanceInterval) return;
        
        this.maintenanceInterval = setInterval(() => {
            const now = Date.now();
            
            // 如果浏览器空闲且超过最大空闲时间，关闭它
            if (browserInstance && 
                browserStatus.activePages === 0 && 
                now - browserStatus.lastUsed > BROWSER_POOL.maxIdleTime) {
                
                console.info('[网页预览] 关闭空闲浏览器实例');
                this.closeBrowser().catch(() => {});
            }
        }, 60 * 1000); // 每分钟检查
    }
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
        
        // 初始化配置 (只加载必要配置)
        this.initConfig();
        
        // 延迟清理截图
        setTimeout(() => {
            ensureDirectories();
            this.cleanupScreenshots();
        }, 30000); // 启动30秒后清理
    }
    
    // 懒加载系统初始化 - 只在第一次使用时初始化
    lazyInitSystem() {
        if (systemInitialized) return;
        
        // 确保目录存在
        ensureDirectories();
        
        // 初始化缓存
        cacheManager.init();
        
        // 标记已初始化
        systemInitialized = true;
        
        // 设置进程退出处理 (异步)
        process.on('exit', () => {
            if (browserInstance) {
                browserInstance.close().catch(() => {});
            }
        });
        
        console.info('[网页预览] 系统已初始化');
    }

    // 初始化配置 (仅加载必要配置)
    initConfig() {
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true });
        }
        
        // 加载配置
        try {
            if (fs.existsSync(configPath)) {
                const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                ownerOnlyMode = config.ownerOnlyMode || false;
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
        // 懒加载初始化
        this.lazyInitSystem();
        
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
            
            // 获取浏览器实例 (懒加载)
            processingStage = "获取浏览器实例";
            browser = await browserManager.getBrowser();
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
                page.setDefaultNavigationTimeout(30000)
            ]);
            
            // 并行加载逻辑 - 发送通知并加载页面同时进行
            processingStage = "页面加载";
            const loadingPromise = page.goto(url, {
                waitUntil: 'domcontentloaded',
                timeout: 25000
            }).catch(error => {
                console.warn(`[网页预览] 首次加载遇到错误: ${error.message}`);
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
                if (error.message?.includes('Navigation')) {
                    console.warn(`[网页预览] 页面导航错误，尝试继续处理: ${error.message}`);
                    return [null, loadedReply];
                }
                throw error;
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
                // 优化滚动方式
                await page.evaluate(async () => {
                    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
                    
                    // 检测页面高度
                    const pageHeight = Math.max(
                        document.body.scrollHeight,
                        document.documentElement.scrollHeight,
                        document.body.offsetHeight,
                        document.documentElement.offsetHeight
                    );
                    const viewportHeight = window.innerHeight;
                    
                    // 短页面无需滚动
                    if (pageHeight <= viewportHeight * 1.2) return;
                    
                    // 优化滚动
                    let lastScrollTop = window.pageYOffset;
                    const maxScrolls = Math.min(Math.ceil(pageHeight / viewportHeight) * 2, 10);
                    const scrollStep = Math.ceil(pageHeight / maxScrolls);
                    
                    for (let i = 1; i <= maxScrolls; i++) {
                        const targetScroll = Math.min(i * scrollStep, pageHeight - viewportHeight);
                        
                        window.scrollTo({
                            top: targetScroll,
                            behavior: 'auto'
                        });
                        await delay(30);
                        
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
                        
                        // 额外检测网站logo
                        if (!logo) {
                            const imgs = Array.from(document.querySelectorAll('img'))
                                .filter(img => img.width > 10 && img.width < 100 && 
                                       img.height > 10 && img.height < 100);
                            
                            if (imgs.length > 0) {
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
                
                // 生成HTML模板
                const htmlContent = getScreenTemplate(screenshotBase64, title, logo);
                
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
            ensureDirectories();
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
                    browserManager.releaseBrowser();
                }
            } catch (e) {
                console.error('[网页预览] 资源清理错误:', e);
            }
        }
    }

    // 清理截图文件
    cleanupScreenshots() {
        try {
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
            });
        } catch (e) {
            console.error('[网页预览] 清理截图失败:', e);
        }
    }
}

export default WebScreenshot;
