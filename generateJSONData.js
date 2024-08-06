const path = require('path');
const fse = require('fs-extra');
const { Proskomma } = require('proskomma');
const pk = new Proskomma();
const fs = require('fs');
const util = require('util');

const readdir = util.promisify(fs.readdir);
const INPUT_DIRECTORY_ROOT = "./input"
const INPUT_DOCUMENTS_PATH = `${INPUT_DIRECTORY_ROOT}/documents`
const INPUT_GWT_PATH = `${INPUT_DIRECTORY_ROOT}/gwt`


// TODO: update this so that it works with other language codes like "hi"
const languageCodeMap = {
    "en": "eng",
    "hi": "hin"
}


async function setup(pk) {
    console.log("===== SETTING UP =====")
    let directories = await getDirectories(`${INPUT_DOCUMENTS_PATH}`)

    for(let i = 0; i < directories.length; i++) {
        let {language, version} = getLanguageAndVersion(directories[i])
        
        let usfmFiles = await getUsfmFiles(`${INPUT_DOCUMENTS_PATH}/${directories[i]}`)

        for(let j = 0; j < usfmFiles.length; j++) {
            const usfmFileContentPath = `${INPUT_DOCUMENTS_PATH}/${directories[i]}/${usfmFiles[j]}`
            await addDocument(pk, usfmFileContentPath, language, version)
        }
    }
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
        return {language: languageCodeMap[language], version: version}
    } else {
        console.error(`Could not extract language code and version from project ${projectName}.`);
    }
}

async function getUsfmFiles(directory) {
    try {
        const files = await readdir(directory);
        return files.filter(file => path.extname(file).toLowerCase() === '.usfm');
    } catch (err) {
        console.error('Error reading directory:', err);
        return [];
    }
}

async function addDocument(pk, contentPath, language, version) {
    let content = fse.readFileSync(path.resolve(__dirname, contentPath)).toString();

    const mutation = `mutation { addDocument(` +
    `selectors: [{key: "lang", value: "${language}"}, {key: "abbr", value: "${version}"}], ` +
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


async function getAlignedVerses(pk, docSetID, bookDocumentID, bookCode, chapter) {
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
            greekAlignmentData.push({strong: getStrongs(attribute.payload)});
        } else if(attribute.subType === "start" && attribute.payload.includes("x-lemma")) {
            greekAlignmentData.push({lemma: getLemma(attribute.payload)});
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


 function getStrongs(str) {
    const regex = /\b[Gg]\d+\b/;
    const match = str.match(regex);
    
    if (match) {
      const strong = match[0];
      return strong
    } else {
      console.log("No match found.");
    }
}


function getLemma(str) {
    const regex = /[^/]+$/;
    const match = str.match(regex);

    if (match[0]) {
        const lemma = match[0];
        return lemma
      } else {
        console.log("No match found.");
      }
}


async function getBookChapterFormat(pk) {

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

async function processDocuments() {
    let loadedDocSets = await getBookChapterFormat(pk)

    loadedDocSets.forEach(docSet => {
        docSet.documents.forEach(document => {
            processBook(docSet.id, document)
        })
    })

    
}

async function processBook(docSetID, bookDocument) {
    for(let i = 1; i <= bookDocument.chapters; i++) {
        getAlignedVerses(pk, docSetID, bookDocument.id, bookDocument.slug, i)
    }
}


async function main(){
    await setup(pk)
    processDocuments()
}

main()