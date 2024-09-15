const axios = require('axios');
const cheerio = require('cheerio');

const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36";

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

    // Async function to handle requests and process the URL
    async request(proxy, proxyType) {
        try {
            const proxyUrl = `${proxyType}://${proxy}`;
            const { data: embedPage } = await axios.get(`https://t.me/${this.channel}/${this.post}?embed=1&mode=tme`, {
                headers: {
                    'Referer': `https://t.me/${this.channel}/${this.post}`,
                    'User-Agent': userAgent,
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
                            'Referer': `https://t.me/${this.channel}/${this.post}?embed=1&mode=tme`,
                            'User-Agent': userAgent,
                            'X-Requested-With': 'XMLHttpRequest',
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

function extractPostDataFromUrl(url) {
    const regex = /t\.me\/([^\/]+)\/(\d+)/;
    const match = url.match(regex);
    if (match) {
        const channel = match[1];
        const post = match[2];
        return { channel, post };
    }
    throw new Error('Invalid URL format. Please provide a valid Telegram post URL.');
}

module.exports = async (req, res) => {
    if (req.method === 'POST') {
        let body = '';

        req.on('data', chunk => {
            body += chunk;
        });

        req.on('end', async () => {
            try {
                const { url, proxy, proxyType, mode } = JSON.parse(body);

                if (!url || !mode) {
                    return res.status(400).json({ error: 'Missing required parameters: url and mode are required' });
                }

                const { channel, post } = extractPostDataFromUrl(url);

                const api = new Telegram(channel, post);

                if (mode === 'l') {
                    if (proxy) {
                        const lines = proxy.split('\n');
                        await api.runProxiesTasks(lines, proxyType || 'http');
                        res.status(200).json(api.getStats());
                    } else {
                        res.status(400).json({ error: 'Proxy file path required for mode "l"' });
                    }
                } else if (mode === 'r') {
                    if (proxy) {
                        await api.runRotatedTask(proxy, proxyType || 'http');
                        res.status(200).json(api.getStats());
                    } else {
                        res.status(400).json({ error: 'Proxy required for mode "r"' });
                    }
                } else {
                    await api.runAutoTasks();
                    res.status(200).json(api.getStats());
                }
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
    } else {
        res.status(405).json({ error: 'Method Not Allowed' });
    }
};
