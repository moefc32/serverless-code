import { Hono } from 'hono';
import corsHeaders from './corsHeaders.js';

import {
    baseDuration,
    cacheControl,
} from '../util/cache.js';
import countStatistics from '../util/countStatistics.js';
import fetch from '../util/fetch.js';
import sendResponse from '../util/sendResponse.js';
import throttleRequests from '../util/throttleRequests.js'

import techStacks from '../data/techStacks.js';
import discordServers from '../data/discordServers.js';

const app = new Hono();
const cache = caches.default;

app.options('/', (c) => {
    return new Response(null, { headers: corsHeaders });
});

app.get('/', async (c) => {
    const env = c.env;
    const ctx = c.executionCtx;
    const cacheKey = new Request(c.req.url, {
        method: 'GET',
    });

    try {
        if (c.req.query('refresh') === 'true') {
            await cache.delete(cacheKey);
        } else {
            const cachedResponse = await cache.match(cacheKey);
            if (cachedResponse) return cachedResponse;
        }

        const github_id = env.CONFIG_GITHUB_ID;
        const github_key = env.CONFIG_GITHUB_KEY;

        if (!github_id || !github_key) {
            return sendResponse({
                message: 'Missing environment variable(s)!',
            }, 500);
        }

        const result = {
            techStacks,
            techLanguages: {},
            discord: [],
            github: {
                repos: [],
                url: `https://github.com/${github_id}`,
            },
        };

        const discordPromises =
            await throttleRequests(discordServers, async (server, index) => {
                try {
                    const cached = await env.KV_CACHE
                        .get(`code:discord:${server}`, { type: 'json' });

                    if (cached) {
                        result.discord.push(cached);
                        return;
                    }

                    const discordResponse = await fetch(
                        `https://discord.com/api/v10/invites/${server}?with_counts=true`
                    );

                    if (!discordResponse?.ok) {
                        const text = await discordResponse.text();
                        throw new Error(`Error fetching Discord server "${server}": ${text}`);
                    }

                    const data = await discordResponse.json();
                    const formattedData = {
                        name: data.guild.name,
                        member: data.approximate_member_count,
                        image: data.guild?.icon
                            ? `https://cdn.discordapp.com/icons/${data.guild.id}/${data.guild.icon}.png`
                            : undefined,
                    };

                    result.discord.push(formattedData);

                    const durationSalt = (index % 7) * baseDuration;
                    const discordServerTTL = (data.approximate_member_count >= 50_000)
                        ? baseDuration * 28 + durationSalt
                        : (data.approximate_member_count >= 12_500)
                            ? baseDuration * 21 + durationSalt
                            : (data.approximate_member_count >= 2_500)
                                ? baseDuration * 14 + durationSalt
                                : baseDuration * 7 + durationSalt

                    await env.KV_CACHE.put(`code:discord:${server}`,
                        JSON.stringify(formattedData), {
                        expirationTtl: discordServerTTL,
                    });

                    return formattedData;
                } catch (e) {
                    console.error(e);
                    return null;
                }
            }, 1, 1500);

        const response = await Promise.allSettled([
            (async () => {
                try {
                    const cached = await env.KV_CACHE
                        .get(`code:github`, { type: 'json' });

                    if (cached) {
                        Object.assign(result, cached);
                        return;
                    }

                    const githubResponse = await fetch(
                        `https://api.github.com/users/${github_id}/repos`,
                        {
                            headers: {
                                'Accept': 'application/vnd.github.v3+json',
                                'Authorization': `token ${github_key}`,
                            },
                        }
                    );

                    if (!githubResponse?.ok) {
                        const code = githubResponse.status;
                        const text = await githubResponse.text();

                        throw new Error(`GitHub API failed (${code}): ${text}`);
                    }

                    const data = await githubResponse.json();

                    const formattedData = data.map((r) => ({
                        id: r.id,
                        title: r.name,
                        description: r.description,
                        language: r.language,
                        url: r.html_url,
                    }));

                    result.github.repos = formattedData;
                    result.techLanguages = countStatistics(formattedData);

                    await env.KV_CACHE.put('code:github', JSON.stringify({
                        github: {
                            repos: result.github.repos,
                            url: result.github.url,
                        },
                        techLanguages: result.techLanguages,
                    }), { expirationTtl: baseDuration });
                } catch (e) {
                    console.error(e);
                    return null;
                }
            })(),

            ...discordPromises,
        ]);

        const cachedData = sendResponse({
            message: 'Fetch data success.',
            data: result,
        }, 200, {
            ...cacheControl,
        });

        if (response.every(r => r.status === 'fulfilled')) {
            ctx.waitUntil(cache.put(cacheKey, cachedData.clone()));
        }

        return cachedData;
    } catch (e) {
        return sendResponse({
            message: e.message,
        }, 500);
    }
});

app.delete('/', async (c) => {
    const cacheKey = new Request(c.req.url, {
        method: 'GET',
    });

    await cache.delete(cacheKey);
    return sendResponse(null, 204);
});

app.all('*', () => {
    return sendResponse({
        message: 'Method not allowed!',
    }, 405);
});

export default {
    fetch: app.fetch,
    async scheduled(evt, env, ctx) {
        try {
            const url = new URL('/', env.BASE_URL);
            const hour = new Date(evt.scheduledTime).getUTCHours();
            if (hour === 4) url.searchParams.set('refresh', 'true');

            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Cloudflare-Cron-Job',
                },
            });

            if (response.ok) {
                console.log('[Cron] Edge cache warmed successfully.');
            } else {
                console.error('[Cron] Warming failed:', response.status);
            }
        } catch (e) {
            console.error(`[Cron] Execution error: ${e.message}`);
        }
    },
};
