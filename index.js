"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs-extra"));
const pathlib = __importStar(require("path"));
const micromatch = __importStar(require("micromatch"));
const memoizee_1 = __importDefault(require("memoizee"));
const os = __importStar(require("os"));
const yargs = __importStar(require("yargs"));
const programArgs = yargs
    .option('game', {
    alias: 'g',
    type: 'string',
    description: 'A game to load values from (.json file)',
    required: true
}).option('gamePath', {
    alias: 'p',
    type: 'string',
    description: 'Path to the game. Ie. C:/Program Files(x86)/steamapps/common/Hearts of Iron IV'
})
    .argv;
const gameConfig = require('./eu4.json');
//const hoi4path = 'C:\\SteamGames\\steamapps\\common\\Hearts of Iron IV';
const hoi4path = 'C:\\SteamGames\\steamapps\\common\\Europa Universalis IV';
const documentsFolder = pathlib.join(os.homedir(), '/Documents/Paradox Interactive');
const gamePathName = gameConfig.gamePathName;
const gameDocuments = pathlib.join(documentsFolder, gamePathName);
const includeDirs = gameConfig.includeDirs;
const blacklist = gameConfig.modifierBlacklist;
if (!fs.existsSync(pathlib.join(gameDocuments, 'mods_registry.json'))) {
    console.log(`No data found at: '${gameDocuments}'`);
    console.log('Please try running again with --docPath specified or try running the game once before.');
}
console.log(`Found game docs in ${gameDocuments}`);
let fileList = [];
for (const dir of includeDirs) {
    let fullPath = pathlib.join(hoi4path, dir);
    fileList.push(...fs.readdirSync(fullPath).map(x => pathlib.join(hoi4path, dir, x)));
}
let hoi4UniqueModifiers = {};
const modifierRegex = /(\w*)\s*=\s*(\d+[.,]\d+|\d+)\s*?/g;
function anyFilterMatches(str) {
    if (blacklist) {
        return micromatch.any(str, blacklist);
    }
    return true;
}
const mmAny = memoizee_1.default(anyFilterMatches, {
    primitive: true
});
let finalMod = pathlib.join(gameDocuments, `mod/GENERATED_10xMM`);
fs.ensureDirSync(finalMod);
fs.emptyDirSync(finalMod);
for (const path of fileList) {
    console.log('Reading: ' + path);
    let content = fs.readFileSync(path).toString('utf8');
    let match;
    let matchesAny = false;
    content = content.replace(modifierRegex, ((match, p1, p2, offset, string) => {
        if (!isNaN(Number(p2)) && !mmAny(p1)) {
            matchesAny = true;
            hoi4UniqueModifiers[p1] = {
                value: p2,
                file: path,
                context: match
            };
            return `${p1} = ${Number(p2) * 10}`;
        }
        else {
            return match;
        }
    }));
    if (matchesAny) {
        let componentPath = pathlib.join(finalMod, path.replace(pathlib.join(hoi4path), ''));
        console.log(`Component path will be written: ${componentPath}`);
        fs.mkdirpSync(pathlib.dirname(componentPath));
        fs.writeFileSync(componentPath, content, {
            encoding: 'utf8'
        });
    }
    else {
        console.log('No usable modifiers found, skipping');
    }
}
fs.writeFileSync(pathlib.join(finalMod, '/descriptor.mod'), `
version="1.0.0"\n
tags={\n
    "Gameplay"\n
}\n
name="GENERATED_10xMM"\n
supported_version="*"\n
`);
console.log(`Wrote mod to ${finalMod}`);
