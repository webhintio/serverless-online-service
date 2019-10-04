const fs = require('fs');
const path = require('path');

const destFilePath = path.join(process.cwd(), 'src', 'status', 'severity.js');
const originalFilePath = path.join(process.cwd(), '..', '..', 'node_modules', '@hint', 'utils', 'dist', 'src', 'types', 'problems.js');

const create = () => {
    fs.copyFileSync(originalFilePath, destFilePath); // eslint-disable-line no-sync
};

create();
