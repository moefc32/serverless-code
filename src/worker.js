import corsHeaders from './corsHeaders.js';
import responseHelper from './responseHelper.js';

import colorPalette from './data/colorPalette.js';
import techStacks from './data/techStacks.js';
import discordServers from './data/discordServers.js';

const cache = caches.default;
const cacheDuration = 60 * 60 * 24;
const cacheControl = { 'Cache-Control': `public, max-age=${cacheDuration}` };

async function apiFetch(url, options = {}) {
    const defaultHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; Win11) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.5993.90 Safari/537.36',
        'Accept': 'application/json',
    };

    options.headers = { ...defaultHeaders, ...(options.headers || {}) };
    return fetch(url, options);
}

function countStatistics(repositories) {
    const finalData = {
        labels: [],
        counts: [],
        colors: [],
    }

    const languages = repositories.reduce((acc, repo) => {
        if (repo.language) {
            acc[repo.language] = (acc[repo.language] || 0) + 1;
        }
        return acc;
    }, {});

    const languageData = Object.entries(languages)
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count);

    finalData.labels = languageData.map(d => d.label);
    finalData.counts = languageData.map(d => d.count);
    finalData.colors = finalData.labels.map(
        (label) => colorPalette[label.toLowerCase()] || '#ddccb8'
    );

    return finalData;
}

export default {
    async fetch(request, env, ctx) {
        switch (request.method) {
            case 'OPTIONS':
                return new Response(null, { headers: corsHeaders });

            case 'GET':
                try {
                    const cachedResponse = await cache.match(request);

                    if (cachedResponse) {
                        const age = cachedResponse.headers.get('CF-Cache-Age');
                        if (age !== null && parseInt(age) < cacheDuration) {
                            return cachedResponse;
                        }
                    }

                    const github_id = env.CONFIG_GITHUB_ID;

                    if (!github_id) {
                        return responseHelper({
                            message: 'Missing environment variable(s)!',
                        }, 500);
                    }

                    const response = await apiFetch(
                        `https://api.github.com/users/${github_id}/repos`, {
                        headers: {
                            'Accept': 'application/vnd.github.v3+json',
                        }
                    });

                    const result = {
                        techStacks,
                        techLanguages: {},
                        discord: [],
                        github: [],
                    };

                    if (response?.ok) {
                        const data = await response.json();

                        data?.forEach((item) => {
                            result.github.push({
                                id: item.id,
                                title: item.name,
                                description: item.description,
                                language: item.language,
                                url: item.html_url,
                            });
                        });

                        result.techLanguages = countStatistics(result.github);
                    } else {
                        const text = await response.text();
                        console.error(`GitHub API failed: ${text}`);
                    }

                    const discordData = await Promise.allSettled(
                        discordServers.map(async (server) => {
                            try {
                                const response = await apiFetch(
                                    `https://discord.com/api/v10/invites/${server}?with_counts=true`
                                );

                                if (!response?.ok) {
                                    const text = await response.text();
                                    throw new Error(`Error fetching Discord server "${server}":`, text);
                                }

                                const data = await response.json();

                                return {
                                    name: data.guild.name,
                                    member: data.approximate_member_count,
                                    image:
                                        `https://cdn.discordapp.com/icons/${data.guild.id}/${data.guild.icon}.png`,
                                };
                            } catch (e) {
                                console.error(e);
                                return null;
                            }
                        })
                    );

                    result.discord = discordData.flatMap((r) =>
                        r.status === 'fulfilled' && r.value ? [r.value] : []
                    );

                    const cachedData = responseHelper({
                        message: 'Fetch data success.',
                        data: result,
                    }, 200, {
                        ...cacheControl,
                    });

                    ctx.waitUntil(cache.put(request, cachedData.clone()));
                    return cachedData;
                } catch (e) {
                    return responseHelper({
                        message: e.message,
                    }, 500);
                }

            case 'DELETE':
                await cache.delete(request);
                return responseHelper(null, 204);

            default:
                return responseHelper({
                    message: 'Method not allowed!'
                }, 405);
        }
    },
};
