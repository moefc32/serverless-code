export default async function (items, fn, batchSize = 2, delay = 1000) {
    const results = [];

    for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        const batchResults = await Promise.all(
            batch.map(item => fn(item, i))
        );

        results.push(...batchResults);

        if (i + batchSize < items.length) {
            await new Promise(r => setTimeout(r, delay));
        }
    }

    return results;
}
