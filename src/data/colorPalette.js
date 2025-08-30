export default Object.fromEntries(
    Object.entries({
        html: '#e34c26',
        css: '#264de4',
        javascript: '#f7df1e',
        php: '#4f5d95',
        python: '#3776ab',
        svelte: '#ff4408',
    }).map(([k, v]) => [k.toLowerCase(), v])
);
