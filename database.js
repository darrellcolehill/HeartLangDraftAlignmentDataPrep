const sqlite3 = require('sqlite3').verbose();

let db = new sqlite3.Database('alignedData.db');

function initialize() {
    db.run(`CREATE TABLE IF NOT EXISTS verses (
        id INTEGER PRIMARY KEY,
        languageCode TEXT NOT NULL,
        version TEXT NOT NULL,
        book TEXT NOT NULL,
        chapter TEXT NOT NULL,
        verse INTEGER NOT NULL,
        verseText TEXT NOT NULL,
        interleavedVerseText TEXT NOT NULL
    )`, (err) => {
        if (err) {
            return console.error(err.message);
        }
        console.log('Table created or already exists.');
    });
}

async function insert(languageCode, version, book, chapter, verse, verseText, interleavedVerseText) {
    if (!languageCode || !version || !book || !chapter || !verse || !verseText || !interleavedVerseText) {
        console.error(`Invalid insert values: '${languageCode}', '${version}', '${book}', ${chapter}, ${verse}, '${verseText}', '${interleavedVerseText}'`);
        return;
    }

    db.run(`INSERT INTO verses (languageCode, version, book, chapter, verse, verseText, interleavedVerseText) 
            VALUES (?, ?, ?, ?, ?, ?, ?)`, [languageCode, version, book, chapter, verse, verseText, interleavedVerseText], (err) => {
        if (err) {
            console.log(`'${languageCode}', '${version}', '${book}', '${chapter}', '${verse}', '${verseText}', '${interleavedVerseText}'`)
            return console.error(err.message);
        }
        console.log('Row inserted.');
    });
}

function update(id, languageCode, version, book, chapter, verse, verseText, interleavedVerseText) {
    if (!id || !languageCode || !version || !book || !chapter || !verse || !verseText || !interleavedVerseText) {
        console.error(`Invalid update values: '${id}', '${languageCode}', '${version}', '${book}', ${chapter}, ${verse}, '${verseText}', '${interleavedVerseText}'`);
        return;
    }

    db.run(`UPDATE verses 
            SET languageCode = ?, version = ?, book = ?, chapter = ?, verse =?, verseText = ?, interleavedVerseText = ? 
            WHERE id = ?`, [languageCode, version, book, chapter, verse, verseText, interleavedVerseText, id], (err) => {
        if (err) {
            return console.error(err.message);
        }
        console.log(`Row with id ${id} updated.`);
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

module.exports = {
    initialize,
    insert,
    update,
    close
};
