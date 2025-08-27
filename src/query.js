export async function getDiscordServers(db) {
    const result = await db
        .prepare('SELECT * FROM Discord ORDER BY name ASC;').all();

    return result.results;
}
