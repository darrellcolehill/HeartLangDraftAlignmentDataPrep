const sqlite3 = require('sqlite3').verbose();

let db = new sqlite3.Database('mydatabase.db');

function initialize() {
    db.run(`CREATE TABLE IF NOT EXISTS verses (
        id INTEGER PRIMARY KEY,
        languageCode: TEXT NOT NULL,
        version: TEXT NOT NULL,
        book TEXT NOT NULL,
        chapter TEXT NOT NULL,
        verse TEXT NOT NULL,
        interleavedVerse TEXT NOT NULL
    )`, (err) => {
        if (err) {
            return console.error(err.message);
        }
        console.log('Table created or already exists.');
    });
}

function insert(languageCode, version, book, chapter, verse, interleavedVerse) {
    if (!languageCode || !version || !book || !chapter || !verse || !interleavedVerse) {
        console.error(`Invalid insert values: '${languageCode}', '${version}', '${book}', '${chapter}', '${verse}', '${interleavedVerse}'`);
        return;
    }

    db.run(`INSERT INTO verses (languageCode, version, book, chapter, verse, interleavedVerse) 
            VALUES (?, ?, ?, ?)`, [languageCode, version, book, chapter, verse, interleavedVerse], (err) => {
        if (err) {
            return console.error(err.message);
        }
        console.log('Row inserted.');
    });
}

function update(id, languageCode, version, book, chapter, verse, interleavedVerse) {
    if (!id || !languageCode || !version || !book || !chapter || !verse || !interleavedVerse) {
        console.error(`Invalid update values: '${id}', '${languageCode}', '${version}', '${book}', '${chapter}', '${verse}', '${interleavedVerse}'`);
        return;
    }

    db.run(`UPDATE verses 
            SET languageCode = ?, version = ?, book = ?, chapter = ?, verse = ?, interleavedVerse = ? 
            WHERE id = ?`, [languageCode, version, book, chapter, verse, interleavedVerse, id], (err) => {
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
