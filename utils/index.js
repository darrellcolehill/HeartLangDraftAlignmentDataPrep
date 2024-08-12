
const fs = require('fs');
const util = require('util');
const languageCodeMap = require('../mapping/languageCodeMap').languageCodeMap
const readdir = util.promisify(fs.readdir);

async function getDirectories(source) {
    return (await readdir(source, { withFileTypes: true }))
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name)
}



function getLanguageAndVersion(projectName) {

    // Extracts the language and version from aligned bibles on Door43 from projects in the from of
    // langCode_version
    const repoNamePattern = /^([^_]+)_(.+)$/;
    const match = projectName.match(repoNamePattern);

    if (match) {
        const language = match[1]; 
        const version = match[2];
        return {language: language, version: version}
    } else {
        console.error(`Could not extract language code and version from project ${projectName}.`);
    }
}



module.exports = {
    getDirectories,
    getLanguageAndVersion
};