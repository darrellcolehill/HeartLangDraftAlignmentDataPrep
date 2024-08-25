const { Worker } = require('worker_threads');
const path = require('path');
const { getDirectories, getLanguageAndVersion } = require('./utils');
const INPUT_DIRECTORY_ROOT = "./input"
const INPUT_DOCUMENTS_PATH = `${INPUT_DIRECTORY_ROOT}/documents`
const dbModule = require('./database/database');
const DatabasePopulator = require('./database/DatabasePopulator');
const UgntDataGenerator = require('./UgntDataGenerator');
const DataGenerator = require('./DataGenerator')


// Function to create a worker thread for each language-version pair
function runWorker(language, version) {
    return new Promise((resolve, reject) => {
        const worker = new Worker(path.resolve(__dirname, 'worker.js'), {
            workerData: { language, version }
        });

        worker.on('message', (message) => {
            console.log(`Worker ${language}_${version}: ${message}`);
        });

        worker.on('error', (error) => {
            console.error(`Worker ${language}_${version} encountered an error:`, error);
            reject(error);
        });

        worker.on('exit', (code) => {
            if (code !== 0) {
                reject(new Error(`Worker ${language}_${version} stopped with exit code ${code}`));
            } else {
                resolve();
            }
        });
    });
}


// Create workers for all language-version pairs
async function generateData() {
    const inputBiblesPath = await getDirectories(`${INPUT_DOCUMENTS_PATH}`)
    const allLanguageVersionPairs = inputBiblesPath.map(inputBiblePath => {
        let {language, version} = getLanguageAndVersion(inputBiblePath)
        return {language: language, version: version}
    })
    
    // Create an array of promises for all workers
    const workerPromises = allLanguageVersionPairs.map(({ language, version }) => {
        return runWorker(language, version).catch(error => {
            console.error(`Error running worker for ${language}_${version}:`, error);
            // Returning a resolved promise to ensure Promise.all still completes even if one worker fails
            return Promise.resolve();
        });
    });



    // Wait for all worker promises to complete
    try {
        await Promise.all(workerPromises);
        console.log('All workers completed.');
    } catch (error) {
        console.error('Error in running workers:', error);
    }
}

// generateData()

async function main() {
    dbModule.initialize()
    const dataGenerator = new DataGenerator()
    await dataGenerator.generateData("en", "ult")

    const databasePopulator = new DatabasePopulator(dbModule)
    await databasePopulator.populate()

    const ugntDataGenerator = new UgntDataGenerator()
    await ugntDataGenerator.generateData(dbModule)

    await dbModule.sort()
    dbModule.close()
}

main()