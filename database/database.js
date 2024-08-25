const sqlite3 = require('sqlite3').verbose();
const util = require('util');


let db = new sqlite3.Database('alignedData.db');

async function initialize() {

    return new Promise((resolve, reject) => {

        db.run(`
        CREATE TABLE IF NOT EXISTS verses (
            languageCode TEXT NOT NULL,
            version TEXT NOT NULL,
            book TEXT NOT NULL,
            chapter INTEGER NOT NULL,
            verse INTEGER NOT NULL,
            verseText TEXT NOT NULL,
            interleavedVersetextWithStrong TEXT NOT NULL,
            interleavedVerseTextWithLemma TEXT NOT NULL,
            interleavedVerseTextWithContent TEXT NOT NULL,
            sort INTEGER NOT NULL,
            PRIMARY KEY (languageCode, version, book, chapter, verse)
        )`, (err) => {

            if (err) {
                console.log("error here")
                return reject(err.message);
            }
            console.log('Table created or already exists.');

            resolve();
        });

    });
}

async function insert(newRow) {
    const {
        languageCode, 
        version, 
        book, 
        chapter, 
        verse, 
        verseText, 
        interleavedVerseTextWithStrong, 
        interleavedVerseTextWithLemma, 
        interleavedVerseTextWithContent, 
        sort
    } = newRow;

    // Validation: check if all necessary properties exist and are valid
    if (
        !languageCode || 
        !version || 
        !book || 
        !chapter || 
        !verse || 
        !verseText || 
        !interleavedVerseTextWithStrong || 
        !interleavedVerseTextWithLemma || 
        !interleavedVerseTextWithContent || 
        !sort
    ) {

        if(!interleavedVerseTextWithStrong) {
            console.log("interleavedVerseTextWithStrong is null")
            console.log(interleavedVerseTextWithStrong)
        }
        console.log(!languageCode + " " + !version + " " + !book + " " + !chapter + " " + !verse + " " + !verseText + " " + !interleavedVerseTextWithStrong + " " + !interleavedVerseTextWithLemma + " " + !interleavedVerseTextWithContent + " " + !sort)
        // console.error(`Invalid insert values: ${JSON.stringify(newRow)}`);
        return;
    }

    // Return a promise to allow for async/await handling
    return new Promise((resolve, reject) => {
        db.run(
            `INSERT INTO verses (languageCode, version, book, chapter, verse, verseText, interleavedVerseTextWithStrong, interleavedVerseTextWithLemma, interleavedVerseTextWithContent, sort) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                languageCode, 
                version, 
                book, 
                chapter, 
                verse, 
                verseText, 
                interleavedVerseTextWithStrong, 
                interleavedVerseTextWithLemma, 
                interleavedVerseTextWithContent, 
                sort
            ], 
            (err) => {
                if (err) {
                    console.log(`Error inserting row: ${JSON.stringify(newRow)}`);
                    return reject(err.message);
                }
                resolve();
            }
        );
    });
}


function close() {
    db.close((err) => {
        if (err) {
            return console.error(err.message);
        }
        console.log('Closed database connection.');
    });
}


async function sort() {
    try {
        await new Promise((resolve, reject) => {
            db.run(`   
                CREATE TABLE sorted_table AS
                SELECT *
                FROM verses
                ORDER BY sort;`, 
                (err) => {
                    if (err) {
                        console.log("Error in creating sorted_table");
                        return reject(err.message);
                    }
                    resolve();
                }
            );
        });

        await new Promise((resolve, reject) => {
            db.run(`DROP TABLE verses;`, 
                (err) => {
                    if (err) {
                        console.log("Error in dropping verses table");
                        return reject(err.message);
                    }
                    resolve();
                }
            );
        });

        await new Promise((resolve, reject) => {
            db.run(`ALTER TABLE sorted_table RENAME TO verses;`, 
                (err) => {
                    if (err) {
                        console.log("Error in renaming sorted_table to verses");
                        return reject(err.message);
                    }
                    resolve();
                }
            );
        });

        console.log("Table sorting completed successfully");
    } catch (error) {
        console.error("Error during table sort:", error);
    } finally {
        db.close((err) => {
            if (err) {
                console.error("Error closing the database:", err.message);
            } else {
                console.log("Closed database connection.");
            }
        });
    }
}


module.exports = {
    initialize,
    insert,
    close,
    sort
};
