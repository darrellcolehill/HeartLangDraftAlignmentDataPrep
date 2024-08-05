const path = require('path');
const fse = require('fs-extra');
const { Proskomma } = require('proskomma');
const pk = new Proskomma();
const fs = require('fs');


async function setup(pk) {
    addDocument(pk, './documents/43-LUK-en-UST.usfm')
    addDocument(pk, './documents/41-MAT-ULT.usfm')
 }

 async function addDocument(pk, contentPath) {
    let content = fse.readFileSync(path.resolve(__dirname, contentPath)).toString();

    const mutation = `mutation { addDocument(` +
    `selectors: [{key: "lang", value: "eng"}, {key: "abbr", value: "ust"}], ` + // TODO: set this dynamically
    `contentType: "usfm", ` +
    `content: """${content}""") }`;

    const result = await pk.gqlQuery(mutation);
    let cvData = result.data
    console.log(JSON.stringify(result, null, 2));
 }


// DATA TYPES THAT I NEED TO PARSE INTO
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

setup(pk);

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

processDocuments()