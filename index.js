const axios = require('axios');
const cheerio = require('cheerio');
const { parse } = require('querystring');

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

    getStats() {
        return {
            successSent: this.successSent,
            failedSent: this.failedSent,
            cookieError: this.cookieError,
            tokenError: this.tokenError,
            proxyError: this.proxyError,
        };
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

module.exports = async (req, res) => {
    if (req.method === 'POST') {
        const body = await new Promise(resolve => {
            let data = '';
            req.on('data', chunk => data += chunk);
            req.on('end', () => resolve(parse(data)));
        });

        const { channel, post, proxy, proxyType, mode } = body;

        if (!channel || !post || !mode) {
            res.status(400).send('Missing required parameters');
            return;
        }

        const api = new Telegram(channel, post);

        if (mode === 'l') {
            if (proxy) {
                const lines = proxy.split('\n');
                await api.runProxiesTasks(lines, proxyType || 'http');
                res.status(200).send(api.getStats());
            } else {
                res.status(400).send('Proxy file path required for mode "l"');
            }
        } else if (mode === 'r') {
            if (proxy) {
                await api.runRotatedTask(proxy, proxyType || 'http');
                res.status(200).send(api.getStats());
            } else {
                res.status(400).send('Proxy required for mode "r"');
            }
        } else {
            await api.runAutoTasks();
            res.status(200).send(api.getStats());
        }
    } else {
        res.status(405).send('Method Not Allowed');
    }
};
