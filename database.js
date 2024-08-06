const sqlite3 = require('sqlite3').verbose();

let db = new sqlite3.Database('mydatabase.db');

function initialize() {
    db.run(`CREATE TABLE IF NOT EXISTS verses (
        id INTEGER PRIMARY KEY,
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

function insert(book, chapter, verse, interleavedVerse) {
    if (!book || !chapter || !verse || !interleavedVerse) {
        console.error(`Invalid insert values: '${book}', '${chapter}', '${verse}', '${interleavedVerse}'`);
        return;
    }

    db.run(`INSERT INTO verses (book, chapter, verse, interleavedVerse) 
            VALUES (?, ?, ?, ?)`, [book, chapter, verse, interleavedVerse], (err) => {
        if (err) {
            return console.error(err.message);
        }
        console.log('Row inserted.');
    });
}

function update(id, book, chapter, verse, interleavedVerse) {
    if (!id || !book || !chapter || !verse || !interleavedVerse) {
        console.error(`Invalid update values: '${id}', '${book}', '${chapter}', '${verse}', '${interleavedVerse}'`);
        return;
    }

    db.run(`UPDATE verses 
            SET book = ?, chapter = ?, verse = ?, interleavedVerse = ? 
            WHERE id = ?`, [book, chapter, verse, interleavedVerse, id], (err) => {
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
