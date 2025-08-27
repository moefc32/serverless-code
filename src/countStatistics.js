import colorPalette from './data/colorPalette.js';

export default function (repositories) {
    const finalData = {
        labels: [],
        counts: [],
        colors: [],
    }

    const languages = repositories.reduce((acc, repo) => {
        if (repo.language) acc[repo.language] = (acc[repo.language] || 0) + 1;
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
