const fs = require('fs');
const rimraf = require('rimraf');

const functionsFile = 'functions.json';

const main = () => {
    fs.readFile(functionsFile, 'utf-8', (err, data) => {
        if (err) {
            throw (err);
        } else {
            const json = JSON.parse(data);

            json.forEach((node) => {
                const name = `function-${node.name}`;

                if (fs.existsSync(name)){
                    rimraf.sync(name);
                }

                fs.mkdir(name);
                fs.writeFile(`${name}/function.json`, JSON.stringify(node.template, null, 4), (err) => {
                    if (err) {
                        throw (err);
                    }
                });
            });
        }
    });
};

main();
