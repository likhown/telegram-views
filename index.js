const axios = require('axios');
const cheerio = require('cheerio');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36";
const regex = /(?:^|\D)?((?:[1-9]|[1-9]\d|1\d{2}|2[0-4]\d|25[0-5])\.(?:\d|[1-9]\d|1\d{2}|2[0-4]\d|25[0-5])\.(?:\d|[1-9]\d|1\d{2}|2[0-4]\d|25[0-5])\.(?:\d|[1-9]\d|1\d{2}|2[0-4]\d|25[0-5])):(?:\d|[1-9]\d{1,3}|[1-5]\d{4}|6[0-4]\d{3}|65[0-4]\d{2}|655[0-2]\d|6553[0-5])(?:\D|$)/g;

class Telegram {
    constructor(channel, post) {
        this.tasks = 225;
        this.channel = channel;
        this.post = post;
        this.cookieError = 0;
        this.successSent = 0;
        this.failedSent = 0;
        this.tokenError = 0;
        this.proxyError = 0;
    }

    async request(proxy, proxyType) {
        try {
            const proxyUrl = `${proxyType}://${proxy}`;
            const { data: embedPage } = await axios.get(`https://t.me/${this.channel}/${this.post}?embed=1&amp;mode=tme`, {
                headers: {
                    'Referer': `https://t.me/${this.channel}/${this.post}`,
                    'User-Agent': userAgent,
                },
                proxy: {
                    host: proxy.split(':')[0],
                    port: parseInt(proxy.split(':')[1]),
                },
                timeout: 5000,
            });

            const cookieMatches = /stel_ssid/.test(embedPage);
            if (cookieMatches) {
                const viewsTokenMatch = /data-view="([^"]+)"/.exec(embedPage);
                if (viewsTokenMatch) {
                    const viewsToken = viewsTokenMatch[1];
                    const { data: viewsResponse } = await axios.post(`https://t.me/v/?views=${viewsToken}`, {}, {
                        headers: {
                            'Referer': `https://t.me/${this.channel}/${this.post}?embed=1&amp;mode=tme`,
                            'User-Agent': userAgent,
                            'X-Requested-With': 'XMLHttpRequest',
                        },
                        proxy: {
                            host: proxy.split(':')[0],
                            port: parseInt(proxy.split(':')[1]),
                        },
                        timeout: 5000,
                    });

                    if (viewsResponse === "true") {
                        this.successSent++;
                    } else {
                        this.failedSent++;
                    }
                } else {
                    this.tokenError++;
                }
            } else {
                this.cookieError++;
            }
        } catch (error) {
            this.proxyError++;
        }
    }

    async runProxiesTasks(lines, proxyType) {
        const chunks = this.chunkArray(lines, this.tasks);
        for (const chunk of chunks) {
            await Promise.all(chunk.map(proxy => this.request(proxy, proxyType)));
        }
    }

    async runRotatedTask(proxy, proxyType) {
        while (true) {
            await Promise.all(Array.from({ length: this.tasks }, () => this.request(proxy, proxyType)));
        }
    }

    async runAutoTasks() {
        while (true) {
            const auto = new Auto();
            const chunks = this.chunkArray(auto.proxies, this.tasks);
            for (const chunk of chunks) {
                await Promise.all(chunk.map(([proxyType, proxy]) => this.request(proxy, proxyType)));
            }
        }
    }

    chunkArray(array, size) {
        const result = [];
        for (let i = 0; i < array.length; i += size) {
            result.push(array.slice(i, i + size));
        }
        return result;
    }

    cli() {
        const logo = `
~ Telegram Auto Views V4 ~
  ~ github.com/TeaByte ~
       ~ @TeaByte ~
        `;

        const updateStats = () => {
            console.clear();
            console.log(logo);
            console.log(`
DATA: 
@${this.channel}/${this.post}
Sent: ${this.successSent}
Fail: ${this.failedSent}

ERRORS:
Proxy Error:  ${this.proxyError}
Token Error:  ${this.tokenError}
Cookie Error: ${this.cookieError}
            `);
        };

        const intervalId = setInterval(updateStats, 300);
        setTimeout(() => clearInterval(intervalId), 60000);  // Run for 1 minute and stop
    }
}

class Auto {
    constructor() {
        this.proxies = [];
        this.init();
    }

    async scrap(sourceUrl, proxyType) {
        try {
            const { data: html } = await axios.get(sourceUrl, {
                headers: { 'User-Agent': userAgent },
                timeout: 15000,
            });

            const matches = Array.from(html.matchAll(regex));
            for (const match of matches) {
                this.proxies.push([proxyType, match[1]]);
            }
        } catch (error) {
            fs.appendFileSync('error.txt', `${sourceUrl} -> ${error}\n`, { encoding: 'utf-8' });
        }
    }

    async init() {
        this.proxies = [];
        const httpSources = fs.readFileSync(path.join('auto', 'http.txt'), 'utf-8').split('\n');
        const socks4Sources = fs.readFileSync(path.join('auto', 'socks4.txt'), 'utf-8').split('\n');
        const socks5Sources = fs.readFileSync(path.join('auto', 'socks5.txt'), 'utf-8').split('\n');

        const sources = [
            { urls: httpSources, type: 'http' },
            { urls: socks4Sources, type: 'socks4' },
            { urls: socks5Sources, type: 'socks5' },
        ];

        await Promise.all(sources.map(source =>
            Promise.all(source.urls.map(url => this.scrap(url, source.type)))
        ));
    }
}

// Command line argument parsing
const argv = require('minimist')(process.argv.slice(2));

const channel = argv.channel;
const post = argv.post;
const proxyType = argv.type || 'http';
const mode = argv.mode;
const proxyFile = argv.proxy;

if (!channel || !post || !mode) {
    console.error('Missing required arguments');
    process.exit(1);
}

const api = new Telegram(channel, post);

api.cli();

if (mode === 'l') {
    if (proxyFile) {
        const lines = fs.readFileSync(proxyFile, 'utf-8').split('\n');
        api.runProxiesTasks(lines, proxyType);
    } else {
        console.error('Proxy file path required for mode "l"');
        process.exit(1);
    }
} else if (mode === 'r') {
    if (proxyFile) {
        api.runRotatedTask(proxyFile, proxyType);
    } else {
        console.error('Proxy required for mode "r"');
        process.exit(1);
    }
} else {
    api.runAutoTasks();
}
