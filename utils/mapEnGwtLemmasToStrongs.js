const fs = require('fs').promises;
const path = require('path');

const EN_GWT_PATH = "../input/en_gwt";

async function getLemmaToStrongMap() {
    let directories = await getDirectories(EN_GWT_PATH);
    let lemmaToStrongMap = {};
    for (let i = 0; i < directories.length; i++) {
        let mdFiles = await getMdFiles(`${EN_GWT_PATH}/${directories[i]}`);
        for (let j = 0; j < mdFiles.length; j++) {
            const mdFilePath = `${EN_GWT_PATH}/${directories[i]}/${mdFiles[j]}`;

            const content = await readMdFile(mdFilePath);

            const lemma = getLemmaFromGWTContent(content);
            lemmaToStrongMap[lemma] = mdFiles[j].slice(0, -3)
        }
    }
    await saveToJsonFile(lemmaToStrongMap, './lemmaToStrongMap.json');
}


async function getDirectories(source) {
    try {
        const dirents = await fs.readdir(source, { withFileTypes: true });
        return dirents.filter(dirent => dirent.isDirectory()).map(dirent => dirent.name);
    } catch (err) {
        console.error(`Error reading directories from ${source}:`, err);
        return [];
    }
}


async function getMdFiles(directory) {
    try {
        const files = await fs.readdir(directory);
        return files.filter(file => path.extname(file).toLowerCase() === '.md');
    } catch (err) {
        console.error('Error reading directory:', err);
        return [];
    }
}


async function readMdFile(filePath) {
    try {
        const content = await fs.readFile(filePath, 'utf8');
        return content;
    } catch (err) {
        console.error(`Error reading file ${filePath}:`, err);
        return '';
    }
}


function getLemmaFromGWTContent(gwtContent) {
    const regex = /#\s*([^\s/]+)/;
    const match = gwtContent.match(regex);

    if (match) {
        const result = match[1];
        return result
    } else {
        console.error(`Could not match lemma: ${gwtContent}`);
    }
}


async function saveToJsonFile(data, filePath) {
    try {
        const jsonData = JSON.stringify(data, null, 2);
        await fs.writeFile(filePath, jsonData);
        console.log(`Data successfully saved to ${filePath}`);
    } catch (error) {
        console.error(`Error writing to file ${filePath}:`, error);
    }
}

(async () => {
    await getLemmaToStrongMap();
})();
