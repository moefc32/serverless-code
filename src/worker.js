import colorPalette from './colorPalette.json' assert { type: 'json' };
import techStacks from './techStacks.json' assert { type: 'json' };
import discordServers from './discordServers.json' assert { type: 'json' };

const application = 'Mfc API';
const cache = caches.default;
const cacheDuration = 60 * 60 * 24;
const cacheControl = { 'Cache-Control': `public, max-age=${cacheDuration}` };
const contentTypeJson = { 'Content-Type': 'application/json' };

async function apiFetch(url, options = {}) {
    const defaultHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; Win11) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.5993.90 Safari/537.36',
        'Accept': 'application/json',
    };

    options.headers = { ...defaultHeaders, ...(options.headers || {}) };
    return fetch(url, options);
}

async function countStatistics(repositories) {
    const languages = {};
    const finalData = {
        labels: [],
        counts: [],
        colors: [],
    }

    try {
        repositories.forEach(repo => {
            if (repo.language) {
                if (languages[repo.language]) {
                    languages[repo.language]++;
                } else {
                    languages[repo.language] = 1;
                }
            }
        });

        const languageLabels = Object.keys(languages);
        const languageCounts = Object.values(languages);
        const languageData = languageLabels.map((label, index) => ({
            label,
            count: languageCounts[index],
        }));

        languageData.sort((a, b) => b.count - a.count);
        finalData.labels = languageData.map(data => data.label);
        finalData.counts = languageData.map(data => data.count);

        for (const i of finalData.labels) {
            finalData.colors.push(colorPalette[i.toLocaleLowerCase()] || '#ddccb8');
        }
    } catch (e) {
        console.error('Error occurred when counting statistics!');
    }

    return finalData;
}

export default {
    async fetch(request, env, ctx) {
        switch (request.method) {
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
                        return new Response(JSON.stringify({
                            application,
                            message: 'Missing environment variable(s)!',
                        }), {
                            status: 500,
                            headers: contentTypeJson,
                        });
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

                        result.techLanguages = await countStatistics(result.github);
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

                    result.discord = discordData
                        .filter((r) => r.status === 'fulfilled')
                        .map((r) => r.value);

                    const cachedData = new Response(JSON.stringify({
                        application,
                        message: 'Fetch data success.',
                        data: result,
                    }), {
                        headers: {
                            ...contentTypeJson,
                            ...cacheControl,
                        }
                    });

                    ctx.waitUntil(cache.put(request, cachedData.clone()));
                    return cachedData;
                } catch (e) {
                    return new Response(JSON.stringify({
                        application,
                        message: e.message,
                    }), {
                        status: 500,
                        headers: contentTypeJson,
                    });
                }

            case 'DELETE':
                await cache.delete(request);
                return new Response(null, { status: 204 });

            default:
                return new Response(JSON.stringify({
                    application,
                    message: 'Method not allowed!'
                }), {
                    status: 405,
                    headers: contentTypeJson,
                });
        }
    },
};
