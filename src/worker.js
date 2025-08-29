const application = 'Mfc API';
const contentTypeJson = {
    'Content-Type': 'application/json',
};

async function apiFetch(url, options = {}) {
    const defaultHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; Win11) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.5993.90 Safari/537.36',
        'Accept': 'application/json',
    };

    options.headers = { ...defaultHeaders, ...(options.headers || {}) };
    return fetch(url, options);
}

export default {
    async fetch(request, env, ctx) {
        switch (request.method) {
            case 'GET':
                try {
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

                    if (!response.ok) {
                        const text = await response.text();
                        console.error(`GitHub API returned ${behanceResponse.status}: ${text}`);
                    }

                    const data = await response.json();
                    const result = {
                        techStacks: [],
                        techLanguages: {},
                        discord: [],
                        github: [],
                    };

                    data?.forEach((item) => {
                        result.github.push({
                            id: item.id,
                            title: item.name,
                            description: item.description,
                            language: item.language,
                            url: item.html_url,
                        });
                    });

                    return new Response(JSON.stringify({
                        application,
                        message: 'Fetch data success.',
                        data: result,
                    }), {
                        headers: contentTypeJson,
                    });
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
