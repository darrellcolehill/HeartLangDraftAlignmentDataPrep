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
    async addBibleToGraph(pk, language, version) {

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

    async addAllBiblesToGraph(pk) {
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
            item.payload === "milestone/zaln" 
                || item.subType === "wordLike" 
                || (item.payload.includes("x-strong") && item.subType === "start")
                || (item.payload.includes("x-lemma") && item.subType === "start")
                || (item.payload.includes("x-content") && item.subType === "start")
                || (item.payload.includes("verse/"))
                || (item.subType === "punctuation")
        )

        let alignedVerses = [];
        let alignedText = [];
        // This acts like a stack. Whenever a "start" tag is found we increment, and whenever an "end" tag
        //  is found, we decrement. Once we are at 0, that means that we have consumed content for an 
        //  entire word, and we can add that alignment data to the appropriate accumulator. 
        let alignStartCount = 0; 
        let text = "";
        let greekAlignmentData = []
        let punctuationData = []
        let verseNum = 1;

        // Adds items to the greekAlignmentData accumulator using the following rules. This utilizes the order in which data appears. 
        //  strongs, then lemma, then content. 
        // 1) Create a new greekAlignmentData object when a strongs is encountered and add it to the greekAlignmentData
        //  accumulator
        // 2) Add lemma to last element in greekAlignmentData
        // 3) Add content to last element in greekAlignmentData

        for(let i = 0; i < cvData.length; i++) {
            let attribute = cvData[i];

            if(attribute.subType === "start" && attribute.payload === "milestone/zaln") {
                alignStartCount++; 
            } else if(attribute.subType === "end" && attribute.payload === "milestone/zaln") {
                alignStartCount--; 
            } else if(attribute.subType === "wordLike") {
                let startingChar = text ===   "" ? "" : " "
                text += startingChar + attribute.payload;
            } 
            else if(attribute.subType === "punctuation") {
                // If text is empty, append this to the last text, otherwise, append it to the current string
                if(text === "" && alignedText?.length > 0) {
                    const lastWordPunctuationData = alignedText[alignedText.length - 1].punctuationData
                    lastWordPunctuationData.push(attribute.payload)
                } else {
                    punctuationData.push(attribute.payload)
                }
            } 
            else if(attribute.subType === "start" && attribute.payload.includes("x-strong")) {
                const strong = this.getFiveDigitStrongs(attribute.payload)
                greekAlignmentData.push({strong: strong});

            } else if(attribute.subType === "start" && attribute.payload.includes("x-lemma")) {
                let lemma = this.getLemmaFromUsfm(attribute.payload)
                greekAlignmentData[greekAlignmentData.length - 1]["lemma"] = lemma

            } else if(attribute.subType === "start" && attribute.payload.includes("x-content")) {
                let content = this.getContentFromUSFM(attribute.payload)
                greekAlignmentData[greekAlignmentData.length - 1]["content"] = content

            } else if(attribute.subType === "end" && attribute.payload.includes("verse/")) {
                alignedVerses.push({verseNum: verseNum, alignedVerseText: alignedText})
                verseNum++;
                alignedText = []
            }

            // TODO: make sure that this is handling the last word in each verse correctly. 
            //  I am concerned with the "else if" abover that it is not
            if(alignStartCount === 0 && text != "") {

                // Push alignment text
                if(greekAlignmentData.length > 0) {
                    alignedText.push({text: text, greekAlignmentData: greekAlignmentData, punctuationData: punctuationData});
                } else {
                    alignedText.push({text: text, punctuationData: punctuationData});
                }

                // reset buffers
                text = "";
                greekAlignmentData = [];
                punctuationData = []
            }
        }

        this.writeAlignedVersesToJson(docSetID, bookCode, chapter, alignedVerses)
    }


    // Gets 4 digit strongs. In the case of G12345, it matches on G1234. 
    getFourDigitStrongs(str) {
        const regex = /\bG(\d{4})\d*\b/;
        const match = str.match(regex);
        
        if (match) {
            const strong = 'g' + match[1];
            return strong;
        } else {
            console.error(`Could not match strongs for: ${str}`);
        }
    }


    // Gets 5 digit strongs. In the case of G12345, it matches on G1234. 
    getFiveDigitStrongs(str) {
        const regex = /\bG(\d{5})\d*\b/;
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


    // NOTE: this is really the same as getLemmaFromUSFM, but I am keeping them separate for now until things are more finalized
    // TODO: see if I can combine this and getLemmaFromUSFM when the dust has set.
    getContentFromUSFM(str) {
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

        fs.writeFileSync(filePath, jsonString, (err) => {
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

        for (const docSet of loadedDocSets) {
            for (const document of docSet.documents) {
                this.processBook(pk, docSet.id, document)
            }
        }
    }


    async processBook(pk, docSetID, bookDocument) {
        for(let i = 1; i <= bookDocument.chapters; i++) {
            this.getAlignedVerses(pk, docSetID, bookDocument.id, bookDocument.slug, i)
        }
    }

    async generateData(language, version){
        const pk = new Proskomma();

        if(!language && !version) {
            await this.addAllBiblesToGraph(pk)
        } else {
            await this.addBibleToGraph(pk, language, version)
        }
        this.processDocuments(pk)
    }
}

module.exports = DataGenerator;
