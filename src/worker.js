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
                            error: 'Missing environment variable(s)',
                        }), {
                            status: 500,
                            headers: { 'Content-Type': 'application/json' },
                        });
                    }

                    const response = await apiFetch(`https://api.github.com/users/${github_id}/repos`, {
                        headers: {
                            'Accept': 'application/vnd.github.v3+json',
                        }
                    });

                    if (!response.ok) {
                        const text = await response.text();

                        return new Response(JSON.stringify({
                            error: `GitHub API returned ${response.status}: ${text}`,
                        }), {
                            status: response.status,
                            headers: { 'Content-Type': 'application/json' },
                        });
                    }

                    const data = await response.json();
                    const result = [];

                    data.forEach((item) => {
                        result.push({
                            id: item.id,
                            title: item.name,
                            description: item.description,
                            language: item.language,
                            url: item.html_url,
                        });
                    });

                    return new Response(JSON.stringify(result), {
                        headers: { 'Content-Type': 'application/json' },
                    });
                } catch (e) {
                    return new Response(JSON.stringify({
                        error: e.message,
                    }), {
                        status: 500,
                        headers: { 'Content-Type': 'application/json' },
                    });
                }

            case 'DELETE':
                return new Response(null, { status: 204 });

            default:
                return new Response(JSON.stringify({ error: 'Method not allowed' }), {
                    status: 405,
                    headers: { 'Content-Type': 'application/json' },
                });
        }
    },
};
