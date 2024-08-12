const { parentPort, workerData } = require('worker_threads');
const DataGenerator = require('./DataGenerator');

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    parentPort.postMessage(`Error: ${err.message}`);
});

process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err);
    parentPort.postMessage(`Error: ${err.message}`);
});

async function main() {
    const { language, version } = workerData;
    const dataGenerator = new DataGenerator()
    try {
        dataGenerator.generateData(language, version)
    } catch (error) {
        console.error(`Error processing ${language}_${version}:`, error);
        parentPort.postMessage(`Error: ${error.message}`);
    }
}

main();