const path = require('path');
const fse = require('fs-extra');
const { Proskomma } = require('proskomma');
const pk = new Proskomma();
const fs = require('fs');
const util = require('util');

const readdir = util.promisify(fs.readdir);
const INPUT_DIRECTORY_ROOT = "./documents"

// TODO: update this so that it works with other language codes like "hi"
const languageCodeMap = {
    "en": "eng"
}


async function setup(pk) {

    let directories = await getDirectories(INPUT_DIRECTORY_ROOT)

    directories.forEach(async (directory) => {
        let {language, version} = getLanguageAndVersion(directory)
        
        let usfmFiles = await getUsfmFiles(`${INPUT_DIRECTORY_ROOT}/${directory}`)

        usfmFiles.forEach(usfmFile => {
            const usfmFileContentPath = `${INPUT_DIRECTORY_ROOT}/${directory}/${usfmFile}`
            addDocument(pk, usfmFileContentPath, language, version)
        })
    })
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
    let cvData = result.data
    console.log(JSON.stringify(result, null, 2));
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



// TODO: refine this so that it takes in a docSet ID 
// TODO: have this take in the source target/version so it can be added to the file names as well. 
 async function getAlignedVerses(pk, bookDocumentID, bookCode, chapter) {
    const dataQuery = `
    {
        docSets {
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
    let cvData = result.data.docSets[0].documents[0].cv[0].items.filter((item) => 
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

    const filePath = `./output/${bookCode}-${chapter}.json`;

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
      const extracted = match[0];
      return extracted
    } else {
      console.log("No match found.");
    }
}

function getLemma(str) {
    const regex = /[^/]+$/;
    const lemma = str.match(regex)[0];
    return lemma
}



// TODO: run this per-docSet. That will be necessary once we have different languages with different
//  versions. 
async function getBookChapterFormat(pk) {
    const bookChapterQuery = `
    {
      documents {
        slug: header(id:"bookCode")
        id
        chapters: cIndexes {
            chapter
        }
      }
    
    }   
    `;

    const result = await pk.gqlQuery(bookChapterQuery);

    let mappedDocuments = result.data.documents.map( document => {

        let mappedDocument = {
            chapters: document.chapters.length,
            id: document.id,
            slug: document.slug
        }

        return mappedDocument
    })

    return mappedDocuments
}

async function processDocuments() {
    let loadedDocuments = await getBookChapterFormat(pk)
    loadedDocuments.forEach(document => {
        processBook(document)
    });
    
}

async function processBook(bookDocument) {
    for(let i = 1; i <= bookDocument.chapters; i++) {
        getAlignedVerses(pk, bookDocument.id, bookDocument.slug, i)
    }
}

setup(pk);

// processDocuments()