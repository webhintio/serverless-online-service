const fs = require('fs');
const utils = require('util');
const path = require('path');

const globby = require('globby');

const hintUtils = require('@hint/utils');

const writeFileAsync = utils.promisify(fs.writeFile);
const filename = path.join(process.cwd(), 'src', 'scanner', 'hint-extends.json');

const create = async () => {
    const indexes = await globby(['../../node_modules/@hint/configuration-*/index.json'], { absolute: true, cwd: process.cwd() });

    const results = {};

    for (const index of indexes) {
        const config = require(index);

        if (!config.hints) {
            continue;
        }

        const indexParts = index.split('/');
        const name = indexParts[indexParts.length - 2].replace('configuration-', '');

        results[name] = Object.entries(hintUtils.normalizeHints(config.hints)).reduce((hints, [hintName, value]) => {
            if (value === 'off') {
                return hints;
            }

            if (Array.isArray(value) && value[0] === 'off') {
                return hints;
            }

            hints.push(hintName);

            return hints;
        }, []);
    }


    await writeFileAsync(filename, JSON.stringify(results, null, 4));
};

create();
