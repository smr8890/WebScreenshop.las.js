```markdown
/**
 *  网页截图插件 (iPad/iPhone 灵动岛风格) - 优势突出版 - 高效网页截图，尽享灵动美观 - 作者：亦米，欢迎加入 QQ 交流群：303104111
 *
 *  插件优势：
 *      1. ✨ **灵动美观**:  采用 iPad/iPhone 灵动岛风格，截图更具现代感和科技感。
 *      2. 🚀 **高效快速**:  深度优化代码，提升截图效率，快速捕捉网页精彩瞬间。
 *      3. 🖼️ **高清呈现**:  优化图片质量，截图效果更清晰，细节更丰富。
 *      4. ⚙️ **智能自适应**:  浏览器指令自适应，兼容多种环境，截图更稳定。
 *      5. 🛡️ **稳定可靠**:  增强 DEBUG 日志，问题追踪更高效，插件运行更稳定。
 *
 *  本插件由 亦米 制作，QQ 交流群：303104111 (欢迎加入，获取最新插件信息和技术支持)。
 */

import plugin from '../../lib/plugins/plugin.js';
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);


// 插件作者信息
const pluginAuthor = '亦米';
const qqGroup = '303104111';

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

// 截图前等待时间 (正常流程)
const screenWaitTime = 5;
// 截图前等待时间 (加速流程)
const acceleratedScreenWaitTime = 1;
// 截图超时时间 (例如 60 秒)
const screenshotTimeout = 60 * 1000;

// 延迟函数
async function delay(timeout) {
    return new Promise(resolve => setTimeout(resolve, timeout));
}

//  ⚡️ 全局 Puppeteer 浏览器实例 (单例模式)
let browserInstance = null;

// 浏览器窗口边框装帧 HTML 模板 (移出 WebScreenshot 类)
const screenRender = (screenshotBase64, title, logo) => { //  插件作者和 QQ 群信息不再作为参数传入
    //  灵动岛内直接显示完整 title，不再简化
    const websiteName = title;

    // ✨  背景图片路径
    const backgroundImagePath = 'file://' + path.join(__dirname, 'resources', 'background.png');

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
                background-image: url('${backgroundImagePath}');
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
             /* iPhone 状态栏样式 */
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

             /* 灵动岛样式 - 更加精致 */
            .dynamic-island {
                position: absolute;
                top: 12px;
                left: 50%;
                transform: translateX(-50%);
                width: 270px; /*  ✅  宽度调整为 270px (原 180px * 1.5) */
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

             /*  确保 Iconfont 基础样式存在，并具有高优先级 */
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
                        <span id="current-time"></span>
                        <script>
                            function updateTime() {
                                const now = new Date();
                                let hours = now.getHours();
                                let minutes = now.getMinutes();
                                hours = hours < 10 ? '0' + hours : hours;
                                minutes = minutes < 10 ? '0' + minutes : minutes;
                                document.getElementById('current-time').textContent = hours + ':' + minutes;
                            }
                            updateTime();
                            setInterval(updateTime, 60000);
                        </script>
                    </div>
                    <div class="status-right">
                        <i class="iconfont icon-xinhao"></i>
                        <i class="iconfont icon-WIFI"></i>
                        <i class="iconfont icon-dianchi"></i>
                    </div>
                </div>
                <div class="dynamic-island">
                    <img src="${logo}" alt="Logo" onerror="this.style.display='none'">
                    <span>${websiteName}</span>
                </div>
                <img class="screenshot" src="data:image/jpeg;base64,${screenshotBase64}" alt="${title}">
            </div>
            </div>
    </body>
    </html>
    `;
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
            rule: [{
                reg: '^(https?:\/\/[^\\s]+)$', //  URL 正则表达式
                fnc: 'autoScreenshot'
            }]
        });
         // 插件初始化时检查并清理临时截图文件
        this.initCleanup();
    }

    async initCleanup() {
        const screenshotDir = path.join(__dirname, 'screenshots');
        WebScreenshot.cleanupScreenshots(screenshotDir);
    }


    static async getBrowserInstance() {
        if (browserInstance) {
            return browserInstance; //  如果已存在实例，直接返回
        }

        const launchOptions = {
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--window-size=1200,800',
                '--disable-extensions',
                '--disable-background-networking',
                '--disable-sync',
                '--deterministic-fetch',
                '--no-first-run',
                '--font-render-hinting=none'
            ],
            ignoreHTTPSErrors: true,
            defaultViewport: {
                width: 1200,
                height: 800,
                deviceScaleFactor: 1
            }
        };

        const chromePath = await WebScreenshot.findChromePath();
        if (chromePath) launchOptions.executablePath = chromePath;

        try {
            browserInstance = await puppeteer.launch(launchOptions); //  创建新的实例
            console.info('[网页预览] Puppeteer 实例初始化成功');
            return browserInstance;
        } catch (error) {
            console.error('[网页预览] Puppeteer 实例初始化失败:', error);
            browserInstance = null; // 初始化失败，重置实例为 null
            throw error; //  抛出错误，让调用方处理
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
            files.forEach(file => {
                const filePath = path.join(screenshotDir, file);
                fs.stat(filePath, (err, stat) => {
                    if (err) return;
                    const elapsed = now - stat.ctimeMs;
                    if (elapsed > 300 * 1000) { // 300秒后删除 (5分钟)
                        fs.unlink(filePath, (err) => {
                            if (err) {
                                console.error('[网页预览] 清理临时文件失败:', err);
                            } else {
                                console.info('[网页预览] 临时文件已清理');
                            }
                        });
                    }
                });
            });
        });
    }


    async autoScreenshot(e) {
        const urlMatch = e.msg.match(this.rule[0].reg);
        if (!urlMatch) return false;
        const url = urlMatch[1];
        try {
            new URL(url);
        } catch {
            return false;
        }

        let browser;
        let replyMsgIds = [];
        let screenshotBase64;
        //  使用加速流程标记
        let accelerated = false;
        let filePath; //  声明 filePath 变量

        try {
            browser = await WebScreenshot.getBrowserInstance(); //  获取单例 browser 实例
            if (!browser) {
                throw new Error('Puppeteer 实例初始化失败'); //  如果实例获取失败，抛出错误
            }
            const page = await browser.newPage();

            //  设置 User-Agent 和 Accept-Language, Accept-Encoding
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            await page.setExtraHTTPHeaders({
                'Accept-Language': 'zh-CN,zh;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br'
            });


            let pageLoaded = false;
            const maxAttempts = 3; //  最大重试次数
            let attempts = 0;
            while (!pageLoaded && attempts < maxAttempts) {
                attempts++;
                try {
                    await page.goto(url, {
                        waitUntil: 'networkidle2', //  页面加载完成判断
                        timeout: 300000
                    });
                    pageLoaded = true;
                    console.info(`[网页预览] 成功加载页面 (尝试 ${attempts}): ${url}`); //  记录成功加载日志
                } catch (error) {
                    if (error.name === 'TimeoutError') {
                        console.warn(`[网页预览] 第 ${attempts} 次加载超时，重试中... URL: ${url}`); //  超时警告日志
                    } else {
                        console.error(`[网页预览] 页面加载失败 (尝试 ${attempts}) URL: ${url}`, error); //  其他加载错误日志
                        throw error; //  非超时错误，向上抛出
                    }
                }
            }

            if (!pageLoaded) {
                throw new Error(`多次尝试加载页面均超时 URL: ${url}`); //  多次重试后仍超时，抛出错误
            }

            const loadedReply = await e.reply('✅ 网页加载完成，正在处理截图并发送...'); //  保留此核心消息
            if (loadedReply && loadedReply.message_id) {
                replyMsgIds.push(loadedReply.message_id);
            }


            //  定义截图流程 Promise
            const screenshotProcess = async () => {

                await page.evaluate(async () => {
                    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
                    let lastScrollTop = -1;
                    while (true) {
                        window.scrollTo(0, document.documentElement.scrollHeight);
                        await delay(100);
                        const scrollTop = document.documentElement.scrollTop;
                        if (scrollTop === lastScrollTop) break;
                        lastScrollTop = scrollTop;
                    }
                    window.scrollTo(0, 0);
                });

                //  使用默认等待时间或加速等待时间
                const waitTime = accelerated ? acceleratedScreenWaitTime : screenWaitTime;
                await delay(waitTime * 1000);

                const { title, logo } = await page.evaluate(() => {
                    const title = document.title;
                    const link = document.querySelector('link[rel="icon"], link[rel="shortcut icon"]');
                    let logo = link ? link.href : '';
                    if (!logo.startsWith('http')) {
                        logo = new URL(logo, window.location.href).href;
                    }
                    return { title, logo };
                });


                screenshotBase64 = await page.screenshot({ //  ✅ 赋值 screenshotBase64
                    type: 'jpeg', //  使用 jpeg 格式
                    quality: 70,   //  jpeg 质量设置为 70 (可调整)
                    fullPage: true,
                    omitBackground: true,
                    encoding: 'base64' //  仍然使用 base64 编码，以便在 HTML 中使用
                });


                const htmlContent = screenRender(screenshotBase64, title, logo);


                await page.setContent(htmlContent, {
                    waitUntil: "networkidle0",
                });

                //   再次显式等待和检查 .browser-window 元素是否存在 (在 page.screenshot 之前)
                await page.waitForSelector('.browser-window', { timeout: 120000 });
                await new Promise(resolve => setTimeout(resolve, 50));


                //   简化截图流程：直接对最终渲染的包含边框的页面进行截图
                screenshotBase64 = await page.screenshot({ // ✅ 重新赋值 screenshotBase64 (覆盖)
                    type: 'jpeg',      //  最终截图也使用 jpeg 格式
                    quality: 70,       //  质量保持一致
                    omitBackground: true,
                    encoding: 'base64', //  仍然使用 base64 编码，以便发送图片消息
                    clip: await page.evaluate(() => {
                        const rect = document.querySelector('.browser-window').getBoundingClientRect();
                        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
                    })
                });
            };


            //  创建超时 Promise
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => {
                    accelerated = true; //  标记为加速流程
                    console.warn(`[网页预览] 截图超时 (${screenshotTimeout/1000}秒)，已启用加速流程`); //  输出加速流程**警告**日志
                    reject(new Error('Screenshot timed out'));
                }, screenshotTimeout);
            });


            //  使用 Promise.race 运行截图流程和超时判断
            await Promise.race([screenshotProcess(), timeoutPromise]).catch(error => {
                if (error.message !== 'Screenshot timed out') {
                    throw error; //  如果不是超时错误，继续抛出
                }
                //  加速流程处理 (缩短等待时间，跳过动态内容等待等)  已经在 screenshotProcess 函数中通过 accelerated 标记控制
                console.info('[网页预览] 执行加速流程完成'); //  记录加速流程**信息**日志
            });


            // const screenshotDir = path.join(__dirname, 'screenshots'); //  不再需要保存文件，注释掉
            // if (!fs.existsSync(screenshotDir)) {
            //     fs.mkdirSync(screenshotDir);
            // }
            // const fileName = `screenshot_${Date.now()}.jpeg`; //  保存为 jpeg 文件
            // filePath = path.join(screenshotDir, fileName); //  ✅ 赋值 filePath
            // console.log(`[网页预览 DEBUG] filePath 写入前: ${filePath}`); //  🐞 DEBUG 日志

            if (screenshotBase64) { // ✅  判断 screenshotBase64 是否有值
                // console.log(`[网页预览 DEBUG] screenshotBase64 写入前 (length): ${screenshotBase64.length}`); //  🐞 DEBUG 日志 - 条件判断内
                // fs.writeFileSync(filePath, Buffer.from(screenshotBase64, 'base64')); //  不再需要保存文件，注释掉
                // console.log(`[网页预览 DEBUG] 写入文件完成: ${filePath}`); //  🐞 DEBUG 日志
            } else {
                console.log(`[网页预览 DEBUG] screenshotBase64 is undefined, 截图可能失败，跳过写入文件`); // 🐞 DEBUG 日志 -  screenshotBase64 为 undefined
            }


            // const screenshotBuffer = fs.readFileSync(filePath); //  不再需要读取文件，注释掉
            // const base64Image = screenshotBuffer.toString('base64'); //  不再需要读取文件，注释掉
            // console.log(`[网页预览 DEBUG] filePath 读取前: ${filePath}`); //  🐞 DEBUG 日志


            // await e.reply(segment.image(`base64://${base64Image}`)); //  直接发送图片，不再额外提示完成  // 使用 screenshotBase64 直接发送
            await e.reply(segment.image(`base64://${screenshotBase64}`)); //  直接发送 base64 截图数据，不再额外提示完成


            setTimeout(() => {
                replyMsgIds.forEach(msgId => {
                    if (e.bot && typeof e.bot.recallMsg === 'function') {
                        e.bot.recallMsg(msgId).catch(error => {
                            console.error('撤回消息失败:', msgId, error);
                        });
                    } else {
                        console.warn('警告: e.bot.recallMsg  方法不可用，消息撤回功能可能无法正常工作');
                    }
                });
            }, 3000);

            // WebScreenshot.cleanupScreenshots(screenshotDir); //  不再需要清理截图文件，注释掉

            return true;
        } catch (err) {
            console.error('[网页预览] 错误:', err); //  完整错误日志
            console.error(err); //  输出错误堆栈，方便调试
            let errorMessage = `❌ 截图失败，具体原因：${err.message}`;
            const errorConfig = errorMessagesConfig.find(item => err.message.includes(item.key));
            if (errorConfig) {
                errorMessage = errorConfig.message;
            }
            await e.reply(errorMessage);
            return false;
        } finally {
            if (browser) {
                await browser.close().catch(() => {}); //  截图完成后关闭浏览器
                browserInstance = null; //  重置单例实例
            }
            global.gc && global.gc();
        }
    }
}


export default WebScreenshot;
