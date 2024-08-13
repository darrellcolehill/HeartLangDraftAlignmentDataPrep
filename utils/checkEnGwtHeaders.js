const fs = require('fs').promises;
const path = require('path');

const EN_GWT_PATH = "../input/en_gwt";

async function checkEnGwtHeaders() {
    let directories = await getDirectories(EN_GWT_PATH);

    for (let i = 0; i < directories.length; i++) {
        let mdFiles = await getMdFiles(`${EN_GWT_PATH}/${directories[i]}`);
        for (let j = 0; j < mdFiles.length; j++) {
            const mdFilePath = `${EN_GWT_PATH}/${directories[i]}/${mdFiles[j]}`;
            const content = await readMdFile(mdFilePath);
            // Check if the content starts with 'G' followed by any number of digits
            if (/^G\d+/.test(content)) {
                console.log(`File ${mdFiles[j]} starts with G followed by digits.`);
            }
        }
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

(async () => {
    await checkEnGwtHeaders();
})();
