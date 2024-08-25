const { newTestamentSort } = require('./mapping/NewTestamentSort');
const DataGenerator = require('./DataGenerator');
const { Proskomma } = require('proskomma');

const INPUT_DIRECTORY_ROOT = "./input"
const INPUT_DOCUMENTS_PATH = `${INPUT_DIRECTORY_ROOT}/koine_ugnt`
const dataGenerator = new DataGenerator()

class UgntDataGenerator {

    async addUgntToGraph(pk) {

        let usfmFiles = await dataGenerator.getUsfmFiles(`${INPUT_DOCUMENTS_PATH}`);

        for (let j = 0; j < usfmFiles.length; j++) {
            const usfmFileContentPath = `${INPUT_DOCUMENTS_PATH}/${usfmFiles[j]}`;
            await dataGenerator.addDocument(pk, usfmFileContentPath, "koine", 'ugnt')
        }
        
    }


    async processDocuments(dbModule, pk) {
        let loadedDocSets = await dataGenerator.getBookChapterFormat(pk)

        for (const docSet of loadedDocSets) {
            for (const document of docSet.documents) {
                await this.processBook(dbModule, pk, docSet.id, document);  // Ensure each call is awaited
            }
        }
    }


    async processBook(dbModule, pk, docSetID, bookDocument) {
        for(let i = 1; i <= bookDocument.chapters; i++) {
            await this.getAlignedVerses(dbModule, pk, docSetID, bookDocument.id, bookDocument.slug, i)
        }
    }


    async getAlignedVerses(dbModule, pk, docSetID, bookDocumentID, bookCode, chapter) {
        const dataQuery = `
            {
                docSet(id: "${docSetID}") {
                    documents(ids: ["${bookDocumentID}"]) {
                        cvIndex(chapter:${chapter}) {
                            verses {
                                verse {
                                    text(normalizeSpace: true)
                                }
                            }
                        }
                    }
                }
            }
        `;

        const result = await pk.gqlQuery(dataQuery);
        const verses = result.data.docSet.documents[0].cvIndex.verses

        for(let i = 1; i < verses.length; i++) {
            const verseText = verses[i].verse[0].text

            const bookIdx = newTestamentSort[bookCode].sort
            const bookIdxShifted = (bookIdx << 16) 
            const chapterShifted = (parseInt(chapter) << 8)
            const verseShifted = parseInt(i)
            const sort = bookIdxShifted + chapterShifted + verseShifted

            const newRow = {
                languageCode: "koine",
                version: "ugnt",
                book: bookCode,
                chapter: chapter,
                verse: i,
                verseText: verseText,
                interleavedVerseTextWithStrong: " ",
                interleavedVerseTextWithLemma: " ",
                interleavedVerseTextWithContent: " ",
                sort: sort
            }

            await dbModule.insert(newRow)
        }
    }


    async generateData(dbModule) {
        const pk = new Proskomma();

        await this.addUgntToGraph(pk)
        await this.processDocuments(dbModule, pk)
    }
}

module.exports = UgntDataGenerator;
