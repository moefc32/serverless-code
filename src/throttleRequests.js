export default async function (items, fn, batchSize = 3, delay = 750) {
    const results = [];

    for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        const batchResults = await Promise.all(
            batch.map(item => fn(item))
        );

        results.push(...batchResults);

        if (i + batchSize < items.length) {
            await new Promise(r => setTimeout(r, delay));
        }
    }

    return results;
}
