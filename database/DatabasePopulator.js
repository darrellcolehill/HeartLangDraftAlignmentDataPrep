const path = require('path');
const fs = require('fs');
const util = require('util');
const { getLanguageAndVersion, getDirectories } = require('../utils/index')
const { newTestamentSort } = require('../mapping/NewTestamentSort');

const readdir = util.promisify(fs.readdir);
const INPUT_DIRECTORY_ROOT = "./output"


class DatabasePopulator {

    constructor(dbModule) {
        this.dbModule = dbModule;
    }

    async populate() {
        // await dbModule.initialize()

        let directories = await getDirectories(INPUT_DIRECTORY_ROOT)

        for(let i = 0; i < directories.length; i++) {
            let {language, version} = getLanguageAndVersion(directories[i])
            let jsonFiles = await this.getJsonFiles(`${INPUT_DIRECTORY_ROOT}/${directories[i]}`)

            for(let j = 0; j < jsonFiles.length; j++) {
                const jsonFileContentPath = `${INPUT_DIRECTORY_ROOT}/${directories[i]}/${jsonFiles[j]}`
                console.log(`Adding: ${jsonFileContentPath}`)

                    try {
                        const data = fs.readFileSync(jsonFileContentPath, 'utf8');
                        const jsonData = JSON.parse(data);
                        let {bookName, chapter} = this.getBookNameAndChapter(jsonFiles[j])
                        await this.addChapterToDatabase(this.dbModule, language, version, bookName, chapter, jsonData)
                    } catch (err) {
                        console.error('Error reading the JSON file:', err);
                    }  
            }
        }

        // await dbModule.sort()
        // dbModule.close()
    }


    async getJsonFiles(directory) {
        try {
            const files = await readdir(directory);
            return files.filter(file => path.extname(file).toLowerCase() === '.json');
        } catch (err) {
            console.error('Error reading directory:', err);
            return [];
        }
    }


    getBookNameAndChapter(str) {
        const regex = /^(\d*[A-Z]+)-(\d+)\.json$/;
        const match = str.match(regex);
        
        if (match) {
            const book = match[1];
            const chapter = match[2];
            return {bookName: book, chapter: chapter}
        } else {
            console.error('No match found.');
        }
    }


    async addChapterToDatabase(dbModule, languageCode, version, bookName, chapterNumber, chapterContent) {
        for(let i = 0; i < chapterContent.length; i++) {

            const alignedVerse = chapterContent[i]

            let plainText = "";
            let interleavedTextWithLemma = "";
            let interleavedTextWithStrongs = "";
            let interleavedTextWithContents = "";

            alignedVerse.alignedVerseText.forEach(alignedWord => {
                // Add word
                let punctuations = alignedWord.punctuationData ? `${alignedWord.punctuationData.join(" ")}` : "";
                plainText = `${plainText}${plainText !== "" ? " " : ""}${alignedWord.text} ${punctuations}`;

                // Build interleaved text for lemma, strongs, and contents
                interleavedTextWithLemma += this.buildInterleavedText(alignedWord, "lemma");
                interleavedTextWithStrongs += this.buildInterleavedText(alignedWord, "strong");
                interleavedTextWithContents += this.buildInterleavedText(alignedWord, "content");
            });

            const bookIdx = newTestamentSort[bookName].sort;
            const bookIdxShifted = (bookIdx << 16);
            const chapterShifted = (parseInt(chapterNumber) << 8);
            const verseShifted = parseInt(alignedVerse.verseNum);
            const sort = bookIdxShifted + chapterShifted + verseShifted;

            const newRow = {
                languageCode: languageCode,
                version: version,
                book: bookName,
                chapter: chapterNumber,
                verse: alignedVerse.verseNum,
                verseText: plainText,
                interleavedVerseTextWithStrong: interleavedTextWithStrongs,
                interleavedVerseTextWithLemma: interleavedTextWithLemma,
                interleavedVerseTextWithContent: interleavedTextWithContents,
                sort: sort
            }
            await dbModule.insert(newRow);
        }
    }


    buildInterleavedText(alignedWord, type) {
        let interleavedText = "";
        let leadingSpace = "";
        let punctuations = alignedWord.punctuationData ? `${alignedWord.punctuationData.join(" ")}` : "";
        let data = alignedWord.greekAlignmentData ? alignedWord.greekAlignmentData.map(it => it[type]).join(" ") : "";

        if (data && data.length > 0) {
            leadingSpace = " ";
            interleavedText = `${leadingSpace}${alignedWord.text} ${data} ${punctuations}`;
        } else {
            interleavedText = `${leadingSpace}${alignedWord.text} ${punctuations}`;
        }

        return interleavedText;
    }

}

module.exports = DatabasePopulator;
