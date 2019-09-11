const fs = require('fs');
const rimraf = require('rimraf');

/*
 ** Azure functions enforce a certain folder structure
 ** to work/deploy properly. Essentially, they need all
 ** functions to have a function.json definition file.
 ** Each of those files have to be within a folder
 ** (named after the function) on the root of the project.
 ** This creates the need to have a lot of folders within
 ** the root of the project making it look very messy.
 **
 ** We've instead created a functions.json file that combines
 ** all the function definitions into an array of
 ** (function-name, definition) pair so we can have all of
 ** them in one file. However, since Azure requires the folder
 ** structure, this script will split the definitions array
 ** into individual definitions and place them into
 ** appropriate folders. Those folders don't get checked into
 ** source control, and get re-created every time when building.
 */

const functionsFile = 'functions.json';

const main = () => {
    fs.readFile(functionsFile, 'utf-8', (err, data) => {
        if (err) {
            throw (err);
        } else {
            const json = JSON.parse(data);

            json.forEach((node) => {
                const name = `function-${node.name}`;

                if (fs.existsSync(name)){ // eslint-disable-line no-sync
                    rimraf.sync(name);
                }

                fs.mkdirSync(name); // eslint-disable-line no-sync
                fs.writeFileSync(`${name}/function.json`, JSON.stringify(node.template, null, 4), (err) => { // eslint-disable-line no-sync
                    if (err) {
                        throw (err);
                    }
                });
            });
        }
    });
};

main();
