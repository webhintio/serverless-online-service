const fs = require('fs');
const utils = require('util');
const path = require('path');

const globby = require('globby');

const writeFileAsync = utils.promisify(fs.writeFile);
const filename = path.join(process.cwd(), 'src', 'lib', 'microservices', 'scanner-api', 'categories.json');

const create = async () => {
    const metas = await globby(['./node_modules/@hint/hint-*/dist/src/meta.js'], { absolute: true, cwd: process.cwd() });

    const results = {};

    for (const m of metas) {
        let meta = require(m);

        if (meta.default) {
            meta = meta.default;
        }

        const category = meta.docs && meta.docs.category;

        // !category means it is a multi hints package.
        if (!category) {
            for (let [, multiMeta] of Object.entries(meta)) {
                multiMeta = multiMeta.default;
                results[multiMeta.id] = multiMeta.docs.category;
            }
        } else {
            results[meta.id] = category;
        }
    }


    await writeFileAsync(filename, JSON.stringify(results, null, 4));
};

create();
