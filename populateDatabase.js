const path = require('path');
const fs = require('fs');
const util = require('util');
const dbModule = require('./database');

const readdir = util.promisify(fs.readdir);
const INPUT_DIRECTORY_ROOT = "./output"

async function populate() {
    dbModule.initialize()

    let directories = await getDirectories(INPUT_DIRECTORY_ROOT)

    for(let i = 0; i < directories.length; i++) {
        let {language, version} = getLanguageAndVersion(directories[i])
        let jsonFiles = await getJsonFiles(`${INPUT_DIRECTORY_ROOT}/${directories[i]}`)

        for(let j = 0; j < jsonFiles.length; j++) {
            const jsonFileContentPath = `${INPUT_DIRECTORY_ROOT}/${directories[i]}/${jsonFiles[j]}`
            console.log(`Adding: ${jsonFileContentPath}`)

                try {
                    const data = fs.readFileSync(jsonFileContentPath, 'utf8');
                    const jsonData = JSON.parse(data);
                    let {bookName, chapter} = getBookNameAndChapter(jsonFiles[j])
                    addChapterToDatabase(language, version, bookName, chapter, jsonData)
                } catch (err) {
                    console.error('Error reading the JSON file:', err);
                }  

        }
    }

    dbModule.close()
}


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


async function getJsonFiles(directory) {
    try {
        const files = await readdir(directory);
        return files.filter(file => path.extname(file).toLowerCase() === '.json');
    } catch (err) {
        console.error('Error reading directory:', err);
        return [];
    }
}


function getBookNameAndChapter(str) {
    const regex = /^([A-Z]+)-(\d+)\.json$/;
    const match = str.match(regex);
    
    if (match) {
        const book = match[1];
        const chapter = match[2];
        return {bookName: book, chapter: chapter}
    } else {
        console.error('No match found.');
    }
}


function addChapterToDatabase(languageCode, version, bookName, chapterNumber, chapterContent) {

    chapterContent.forEach(alignedVerse => {
        let plainText = ""
        let interleavedText = ""

        alignedVerse.alignedVerseText.forEach(alignedWord => {

            // TODO: ask drew if this is correct. There are a lot of cases with just o <LEMMA>
            const lemmas = alignedWord?.greekAlignmentData.map(it => {
                return it.lemma
            }).join(" ")

            let leadingSpace = ""
            if(plainText !== "" || interleavedText !== "") {
                leadingSpace = " "
            }

            // Add word
            plainText = `${plainText}${leadingSpace}${alignedWord.text}`

            // If possible, add work with lemma, otherwise, just add the word
            if(lemmas && lemmas.length > 0) {
                interleavedText = `${interleavedText}${leadingSpace}${alignedWord.text} ${lemmas}`
            } else {
                interleavedText = `${interleavedText}${leadingSpace}${alignedWord.text}`
            }
        })

        dbModule.insert(languageCode, version, bookName, chapterNumber, alignedVerse.verseNum, plainText, interleavedText)
    });

}

populate()