import * as fs from 'fs-extra';
import * as pathlib from 'path';
import * as _ from 'lodash'
import * as micromatch from 'micromatch';
import { default as memoize } from 'memoizee';
import * as os from 'os';
import * as yargs from 'yargs';
import { deserializeGenParams, fullPath, GameSettings, GenParams, getModlist, Mod, multiSelect, readAllFiles, readDirFiles, selectionToValue, serializeGenParams, writeDebug } from './tools';
const { MultiSelect } = require('enquirer');
const modName = "GENERATED_MOD"
const programArgs = yargs
    .option('game', {
        alias: 'g',
        type: 'string',
        description: 'A game to load values from (.json file)',
        required: true
    }).option('code',{
        alias: 'c',
        type:'string',
        required: false,
        description:'A predefined mod config'
    })
    .argv
const gameConfig = require('../games/' + programArgs.game + '.json') as GameSettings;

const gamepath = gameConfig.path;
const documentsFolder = pathlib.join(os.homedir(), '/Documents/Paradox Interactive')
if(!fs.existsSync('debug')){
    fs.mkdirSync('debug')
}

const gamePathName: string = gameConfig.gamePathName
const gameDocuments = pathlib.join(documentsFolder, gamePathName)
const blacklist: string[] = gameConfig.modifierBlacklist

let genparams: GenParams|undefined;
if(programArgs.code){
    console.log("Reading prepared mod config.")
    genparams = deserializeGenParams(programArgs.code);
    console.log("Read params.")
}
const mmAny = memoize((str: string) => {
    if (blacklist) {
        return micromatch.any(str, blacklist);
    }
    return true;
}, { primitive: true });

async function main() {
    const mods = await getModlist(gameDocuments);
    const modObj = _.zipObject(mods.map(x=>x.name),mods) as {}
    if(!genparams){
        const selectedIncludeDirs = await multiSelect("Select game features to be affected by CHAOS:",gameConfig.dirSets)
        
        const selectedBlacklists = await multiSelect("Select categories of features to be CHAOTIC:",gameConfig.optional,true);
        if (!fs.existsSync(pathlib.join(gameDocuments, 'dlc_signature'))) {
            console.log(`No data found at: '${gameDocuments}'`)
            console.log('Please try running again with --docPath specified or try running the game once before.');
            return;
        }
        //console.log(`Found game docs in ${gameDocuments}`)

        let selectedModNames= await multiSelect('Found the following mods, which would you like to enable?',modObj)
        const seed = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER/2)

        genparams = {
            includeDirs: selectedIncludeDirs,
            blacklistAdditions: selectedBlacklists,
            mods: selectedModNames,
            seed
        }
    }

    const selectedMods:Mod[] = selectionToValue(genparams.mods,modObj)
    const includeDirs = selectionToValue(genparams.includeDirs,gameConfig.dirSets)
    const blacklistAdditions = selectionToValue(genparams.blacklistAdditions,gameConfig.optional)
    blacklist.push(...blacklistAdditions)

    const rp =_.uniq(_.flatten(selectedMods.map(x=>x.replacePaths)))

    let finalMod = pathlib.join(gameDocuments, `mod/${modName}`);
    fs.ensureDirSync(finalMod)
    fs.emptyDirSync(finalMod)
    const fileMap: {[key: string]: fullPath} = {}
    console.log("Enumerating files & performing copies...")
    for (const dir of includeDirs) {
        if(rp.indexOf(dir) !== -1){
            continue;
        }
        const fullPath = pathlib.join(gamepath, dir)
        const allFiles = readDirFiles(fullPath).map(x => { return { relative: pathlib.join(dir, x), fullpath: pathlib.join(fullPath, x) } });
        for(const file of allFiles){
            fileMap[file.relative] = file.fullpath
        }
    }
    for (const mod of selectedMods) {
        for (const dir of includeDirs) {
            const fullPath = pathlib.join(mod.value, dir);
            if(fs.existsSync(fullPath)){
                const allFiles = readDirFiles(fullPath).map(x => { return { relative: pathlib.join(dir, x), fullpath: pathlib.join(fullPath, x) } });
                for(const file of allFiles){
                    fileMap[file.relative] = file.fullpath
                }
            }
        }
        await fs.copy(mod.value,finalMod);//copy base mod over
    }
    const modifierRegex = /(\w*)\s*=\s*(\d+[.,]\d+|\d+)\s*?/g

    let debug_allprops: any = {}
    let debug_matchedProps: any = {}
    let debug_contents = [];
    const fileContents = await readAllFiles(Object.values(fileMap));
    const relativePaths = Object.keys(fileMap);
    const fileContentContent = Object.values(fileContents)

    console.log("Generating balance...")
    let counterEach =0;
    let counterPeriod = 0;
    for (let i = 0; i < fileContentContent.length; i++) {
        let content = fileContentContent[i]
        let pathRelative = relativePaths[i];
        let matchesAny = false;
        debug_contents.push(content);
        content = content.replace(modifierRegex, ((match, p1, p2, offset, string) => {
            debug_allprops[p1] = p2;
            if (!isNaN(Number(p2)) && !mmAny(p1)) {
                matchesAny = true;
                debug_matchedProps[p1] = p2;
                const factor = Math.sin(counterPeriod + genparams!.seed)
                if(p2.indexOf('.') > -1 && factor < -0.5) {
                    p2 = (Number(p2) * 0.1) + ''
                }
                counterEach++;
                if(counterEach % 30 === 0){
                    counterPeriod++;
                }
                return `${p1} = ${Number(p2) * (factor > 0.5 ? 10 : 1)}`;
            } else {
                return match;
            }
        }))
        if (matchesAny) {
            let componentPath = pathlib.join(finalMod, pathRelative)
            //console.log(`Component path will be written: ${componentPath}`)
            fs.mkdirpSync(pathlib.dirname(componentPath))
            fs.writeFileSync(componentPath, content, {
                encoding: 'utf8'
            })
        } else {
            //console.log('No usable modifiers found, skipping');
        }
    }
    writeDebug('props_all_' + programArgs.game + '.csv', Object.keys(debug_allprops).map(x => x + ',' + debug_allprops[x]).join('\n'))
    writeDebug('props_matched_' + programArgs.game + '.csv', Object.keys(debug_matchedProps).map(x => x + ',' + debug_matchedProps[x]).join('\n'))
    writeDebug('content_' + programArgs.game + '.txt', debug_contents.join('\n\n\n\n\n\n'))

    const rpString = rp.map(x=>`replace_path="${x}"`).join('\n')
    fs.writeFileSync(pathlib.join(finalMod, '/descriptor.mod'), `
version="1.0.0"\n
tags={\n
    "Gameplay"\n
}\n
${rpString}
name="${modName}"\n
supported_version="*"\n
`)
    fs.writeFileSync(pathlib.join(gameDocuments, `mod/${modName}.mod`), `
version="1.0.0"\n
tags={\n
    "Gameplay"\n
}\n
${rpString}
name="${modName}"\n
supported_version="*"\n
path=mod/${modName}\n
`)
    console.log(`Wrote mod to ${finalMod}`)
    console.log(`To share this mod configuration, give this code to your friends:`);
    console.log(`${serializeGenParams(genparams)}`)
}
main();