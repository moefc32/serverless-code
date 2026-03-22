import { Hono } from 'hono';

import corsHeaders from './corsHeaders.js';
import countStatistics from './countStatistics.js';
import fetch from './fetch.js'
import responseHelper from './responseHelper.js';
import throttleRequests from './throttleRequests.js'

import techStacks from './data/techStacks.js';
import discordServers from './data/discordServers.js';

const app = new Hono();

const cache = caches.default;
const baseCacheDuration = 60 * 60 * 24;
const cacheControl = {
    'Cache-Control': `public, max-age=${baseCacheDuration}, stale-while-revalidate=${baseCacheDuration}`
}
const cacheKey = new Request('https://internal/cache/serverless-code', {
    method: 'GET',
});

app.options('/', (c) => {
    return new Response(null, { headers: corsHeaders });
});

app.get('/', async (c) => {
    const env = c.env;
    const ctx = c.executionCtx;

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
            return responseHelper({
                message: 'Missing environment variable(s)!',
            }, 500);
        }

        const result = {
            techStacks,
            techLanguages: {},
            discord: [],
            github: [],
        }

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

                    const durationSalt = (index % 9) * (60 * 60 * 8);
                    const discordServerTTL = (baseCacheDuration * 7) + durationSalt;

                    await env.KV_CACHE.put(`code:discord:${server}`,
                        JSON.stringify(formattedData), {
                        expirationTtl: discordServerTTL,
                    });

                    return formattedData;
                } catch (e) {
                    console.error(e);
                    return null;
                }
            });

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

                    result.github = formattedData;
                    result.techLanguages = countStatistics(formattedData);

                    await env.KV_CACHE.put('code:github', JSON.stringify({
                        github: result.github,
                        techLanguages: result.techLanguages,
                    }), { expirationTtl: baseCacheDuration });
                } catch (e) {
                    console.error(e);
                    return null;
                }
            })(),
            ...discordPromises,
        ]);

        const cachedData = responseHelper({
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
        return responseHelper({
            message: e.message,
        }, 500);
    }
});

app.delete('/', async (c) => {
    await cache.delete(cacheKey);
    return responseHelper(null, 204);
});

app.all('*', () => {
    return responseHelper({
        message: 'Method not allowed!',
    }, 405);
});

export default {
    fetch: app.fetch,
    async scheduled(evt, env, ctx) {
        await app.request('/', {}, env);
        console.log('Cron job processed.');
    },
};
