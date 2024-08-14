const path = require('path');
const fse = require('fs-extra');
const { Proskomma } = require('proskomma');
const fs = require('fs');
const util = require('util');
const bookSlugs = require('./mapping/NewTestamentSlugs').bookSlugs
const languageCodeMap = require('./mapping/languageCodeMap').languageCodeMap

const readdir = util.promisify(fs.readdir);
const INPUT_DIRECTORY_ROOT = "./input"
const INPUT_DOCUMENTS_PATH = `${INPUT_DIRECTORY_ROOT}/documents`
const INPUT_GWT_PATH = `${INPUT_DIRECTORY_ROOT}/en_gwt`
const { getLanguageAndVersion, getDirectories } = require('./utils/index')



class DataGenerator {
        
    // Allows for async data generation
    async setupLangVersion(pk, language, version) {

        let usfmFiles = await this.getUsfmFiles(`${INPUT_DOCUMENTS_PATH}/${language}_${version}`);

        for (let j = 0; j < usfmFiles.length; j++) {
            let bookName = usfmFiles[j].slice(0, -5);
            const bookExists = Object.values(bookSlugs).some(bookSlug => bookSlug.abbreviatedBook === bookName);

            if (bookExists) {
                const usfmFileContentPath = `${INPUT_DOCUMENTS_PATH}/${language}_${version}/${usfmFiles[j]}`;
                await this.addDocument(pk, usfmFileContentPath, language, version);
            }
        }
        
    }

    async setup(pk) {
        console.log("===== ADDING DOCUMENTS TO GRAPH =====")
        let directories = await getDirectories(`${INPUT_DOCUMENTS_PATH}`)

        for(let i = 0; i < directories.length; i++) {
            let {language, version} = getLanguageAndVersion(directories[i])
            
            let usfmFiles = await this.getUsfmFiles(`${INPUT_DOCUMENTS_PATH}/${directories[i]}`)

            for(let j = 0; j < usfmFiles.length; j++) {
                // removes '.usfm'
                let bookName = usfmFiles[j].slice(0, -5);
                // Verifies that book is a New Testament book
                const bookExists = Object.values(bookSlugs).some(bookSlug => bookSlug.abbreviatedBook === bookName);

                if(bookExists) {
                    const usfmFileContentPath = `${INPUT_DOCUMENTS_PATH}/${directories[i]}/${usfmFiles[j]}`
                    await this.addDocument(pk, usfmFileContentPath, language, version)
                }
            }
        }
    }


    async getUsfmFiles(directory) {
        try {
            const files = await readdir(directory);
            return files.filter(file => path.extname(file).toLowerCase() === '.usfm');
        } catch (err) {
            console.error('Error reading directory:', err);
            return [];
        }
    }


    async addDocument(pk, contentPath, language, version) {
        let content = fse.readFileSync(path.resolve(__dirname, contentPath)).toString();

        const mutation = `mutation { addDocument(` +
        `selectors: [{key: "lang", value: "${languageCodeMap[language]}"}, {key: "abbr", value: "${version}"}], ` +
        `contentType: "usfm", ` +
        `content: """${content}""") }`;

        const result = await pk.gqlQuery(mutation);
        console.log(`Added ${contentPath} to graph`)
    }


    // DATA TYPES
    //  type GreekAlignmentData = {
    // 	strong: string;
    // 	morph?: string;
    // }

    // type AlignedText = {
    // 	text: string;
    // 	greekAlignmentData?: GreekAlignmentData[]
    // }


    // type AlignedVerse = {
    // 	verseNum: number;
    // 	alignedVerseText: AlignedText[];
    // }


    async getAlignedVerses(pk, docSetID, bookDocumentID, bookCode, chapter) {
        const dataQuery = `
        {
            docSet(id: "${docSetID}") {
                documents(ids: ["${bookDocumentID}"]) {
                    cv(chapter: "${chapter}") {
                        items {
                            subType
                            payload
                        }
                    }
                }
            }

        }
        `;

        const result = await pk.gqlQuery(dataQuery);
        let cvData = result.data.docSet.documents[0].cv[0].items.filter((item) => 
            item.payload === "milestone/zaln" || item.subType === "wordLike" 
            || (item.payload.includes("x-strong") && item.subType === "start")
            || (item.payload.includes("x-lemma") && item.subType === "start")
            || item.payload.includes("verse/")
        )

        let alignedVerses = [];
        let alignedText = [];
        let alignStartCount = 0; 
        let text = "";
        let greekAlignmentData = []
        let verseNum = 1;

        for(let i = 0; i < cvData.length; i++) {
            let attribute = cvData[i];

            if(attribute.subType === "start" && attribute.payload === "milestone/zaln") {
                alignStartCount++; 
            } else if(attribute.subType === "end" && attribute.payload === "milestone/zaln") {
                alignStartCount--; 
            } else if(attribute.subType === "wordLike") {
                let startingChar = text ===   "" ? "" : " "
                text += startingChar + attribute.payload;
            } else if(attribute.subType === "start" && attribute.payload.includes("x-strong")) {
                const strong = this.getStrongs(attribute.payload)

                const gwtContent = await this.getGreekWordContent(strong)
                if(gwtContent) {
                    const lemma = await this.getLemmaFromGWTContent(gwtContent)
                    if(lemma) {
                        greekAlignmentData.push({strong: strong, lemma: lemma});
                    }
                }

            } else if(attribute.subType === "end" && attribute.payload.includes("verse/")) {
                alignedVerses.push({verseNum: verseNum, alignedVerseText: alignedText})
                verseNum++;
                alignedText = []
            }

            if(alignStartCount === 0 && text != "") {

                // Push alignment text
                if(greekAlignmentData.length > 0) {
                    alignedText.push({text: text, greekAlignmentData: greekAlignmentData});
                } else {
                    alignedText.push({text: text});
                }

                // reset buffers
                text = "";
                greekAlignmentData = [];
            }
        }

        this.writeAlignedVersesToJson(docSetID, bookCode, chapter, alignedVerses)
    }


    // Gets 4 digit strongs. In the case of G12345, it matches on G1234. 
    getStrongs(str) {
        const regex = /\bG(\d{4})\d*\b/;
        const match = str.match(regex);
        
        if (match) {
            const strong = 'g' + match[1];
            return strong;
        } else {
            console.error(`Could not match strongs for: ${str}`);
        }
    }


    async getGreekWordContent(strongs) {
        let folder = await this.getStrongsRange(strongs);
        let filePath = path.resolve(__dirname, `${INPUT_GWT_PATH}/${folder}/${strongs}.md`);

        try {
            if (fs.existsSync(filePath)) {
                let content = fse.readFileSync(filePath).toString();
                return content;
            } else {
                console.error(`${strongs} not found`);
            }
        } catch (error) {
            console.error('There has been a problem with your fetch operation:', error);
        }
    }


    // Takes the target strongs number and calculates its parent folder in the en_gwt repo
    // This is greatly dependent on the current structure of the en_gwt
    getStrongsRange(strongs) {
        let thousandsDigit = strongs.charAt(1);
        let hundredsDigit = strongs.charAt(2);
        let tensDigit = strongs.charAt(3);
        let onesDigit = strongs.charAt(4);

        let strongsNumber =
            thousandsDigit + hundredsDigit + tensDigit + onesDigit;

        strongsNumber = parseInt(strongsNumber);

        let startStrongsRangeNumber;
        let endStrongsRangeNumber;

        if (strongsNumber <= 10) {
            return "g0001-g0010";
        } else if (parseInt(onesDigit) == 0) {
            startStrongsRangeNumber = strongsNumber - 9;
            endStrongsRangeNumber = strongsNumber;
        } else {
            startStrongsRangeNumber =
                strongsNumber - (strongsNumber % 10) + 1;
            endStrongsRangeNumber =
                strongsNumber - (strongsNumber % 10) + 10;
        }

        let startStrongsRangeString = `g${this.makeFourDigitStrongs(startStrongsRangeNumber)}`
        let endStrongsRangeString = `g${this.makeFourDigitStrongs(endStrongsRangeNumber)}`

        let strongsRange = `${startStrongsRangeString}-${endStrongsRangeString}`
        return strongsRange.toLocaleLowerCase();
    }


    // Adds padding zeros (to the second character's posision) until it's length is 5
    makeFourDigitStrongs(strongs) {
        const match = `${strongs}`.match(/(\d+)/);
        if (match) {
            const number = match[1].padStart(4, '0');
            return `${number}`;
        } else {
            console.error("Invalid input format.");
        }
    }


    getLemmaFromGWTContent(gwtContent) {
        const regex = /#\s*([^\s/]+)/;
        const match = gwtContent.match(regex);

        if (match) {
            const result = match[1];
            return result
        } else {
            console.error(`Could not match lemma: ${gwtContent}`);
        }
    }


    getLemmaFromUsfm(str) {
        const regex = /[^/]+$/;
        const match = str.match(regex);

        if (match[0]) {
            const lemma = match[0];
            return lemma
        } else {
            console.error("No match found.");
        }
    }


    writeAlignedVersesToJson(docSetID, bookCode, chapter, alignedVerses) {

        const jsonString = JSON.stringify(alignedVerses, null, 2);

        if (!fs.existsSync(`./output/${docSetID}`)) {
            fs.mkdirSync(`./output/${docSetID}`);
        }

        const filePath = `./output/${docSetID}/${bookCode}-${chapter}.json`;

        fs.writeFile(filePath, jsonString, (err) => {
            if (err) {
                console.error('Error writing to file', err);
            } else {
                console.log(`Saved JSON for ${bookCode}`);
            }
        });
    }

    async getBookChapterFormat(pk) {

        const bookChapterQuery =  `
        {
            docSets {
                id
                documents {
                    slug: header(id:"bookCode")
                    id
                    chapters: cIndexes {
                        chapter
                    }
                }
            }
        }
        `
        const result = await pk.gqlQuery(bookChapterQuery);

        const mappedDocSets = result.data.docSets.map( docSet => {
            
            const mappedDocuments = docSet.documents.map( document => {
                const mappedDocument = {
                    chapters: document.chapters.length,
                    id: document.id,
                    slug: document.slug
                }
                return mappedDocument
            }) 
            
            return {
                id: docSet.id,
                documents: mappedDocuments
            }
        })

        return mappedDocSets
    }


    async processDocuments(pk) {
        console.log("======= PROCESSING DOCUMENTS ========")

        let loadedDocSets = await this.getBookChapterFormat(pk)

        loadedDocSets.forEach(docSet => {
            docSet.documents.forEach(document => {
                this.processBook(pk, docSet.id, document)
            })
        })
    }


    async processBook(pk, docSetID, bookDocument) {
        for(let i = 1; i <= bookDocument.chapters; i++) {
            this.getAlignedVerses(pk, docSetID, bookDocument.id, bookDocument.slug, i)
        }
    }

    async generateData(language, version){
        const pk = new Proskomma();

        if(!language && !version) {
            await this.setup(pk)
        } else {
            await this.setupLangVersion(pk, language, version)
        }
        this.processDocuments(pk)
    }
}


module.exports = DataGenerator;
