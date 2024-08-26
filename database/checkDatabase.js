const sqlite3 = require('sqlite3').verbose();

let db = new sqlite3.Database('alignedData.db');

async function main() {

    let valid = true

    const enUltVerses = await new Promise((resolve, reject) => {

        db.all(`
            SELECT book, chapter, verse, sort
            FROM verses
            WHERE version = 'ult' AND languageCode = 'eng';
        )`, (err, rows) => {

            if (err) {
                console.log("error here")
                return reject(err.message);
            }
            console.log('Table created or already exists.');

            resolve(rows);
        });

    });


    const koineUgntVerses = await new Promise((resolve, reject) => {

        db.all(`
            SELECT book, chapter, verse, sort
            FROM verses
            WHERE version = 'ugnt' AND languageCode = 'koine';
        )`, (err, rows) => {

            if (err) {
                console.log("error here")
                return reject(err.message);
            }
            console.log('Table created or already exists.');

            resolve(rows);
        });

    });

    // Convert each verse list into a Map for easier lookup
    const enUltMap = new Map();
    const koineUgntMap = new Map();

    // Populate the Maps and check for duplicates
    enUltVerses.forEach(({ book, chapter, verse, sort }) => {
        const key = `${book}-${chapter}-${verse}`;
        if (enUltMap.has(key)) {
            valid = false
            console.error(`Duplicate found in enUltVerses: ${key}`);
        } else {
            enUltMap.set(key, sort);
        }
    });

    koineUgntVerses.forEach(({ book, chapter, verse, sort }) => {
        const key = `${book}-${chapter}-${verse}`;
        if (koineUgntMap.has(key)) {
            valid = false
            console.error(`Duplicate found in koineUgntVerses: ${key}`);
        } else {
            koineUgntMap.set(key, sort);
        }
    });

    // Verify that each verse in enUltMap has a match in koineUgntMap and vice versa
    enUltMap.forEach((sort, key) => {
        if (!koineUgntMap.has(key)) {
            valid = false
            console.error(`Missing match in koineUgntVerses for: ${key}`);
        } else if (koineUgntMap.get(key) !== sort) {
            valid = false
            console.error(`Sort mismatch for ${key}: enUlt=${sort}, koineUgnt=${koineUgntMap.get(key)}`);
        }
    });

    koineUgntMap.forEach((sort, key) => {
        if (!enUltMap.has(key)) {
            valid = false
            console.error(`Missing match in enUltVerses for: ${key}`);
        }
    });

    return valid
}

console.log(main())