import * as fs from 'fs-extra';
import * as pathlib from 'path';
import * as _ from 'lodash'
import * as micromatch from 'micromatch';
import { default as memoize } from 'memoizee';
import * as os from 'os';
import * as yargs from 'yargs';
import { deserializeGenParams, fullPath, GameSettings, GenParams, getModlist, getSteamGamePath, Mod, multiSelect, numberInput, readAllFiles, readDirFiles, selectionToValue, serializeGenParams, writeDebug } from './tools';
import { prompt } from 'enquirer';
import {hashElement} from 'folder-hash'
import { BalancerType, createBalancer } from './balancers/balancecreator';
const { Confirm, Select } = require('enquirer');
const modName = "GENERATED_MOD"
const programArgs = yargs.option('code', {
    alias: 'c',
    type: 'string',
    description: 'A predefined mod config'
})
    .argv
const mmAny = memoize((str: string, blacklist: string[]) => {
    if (blacklist) {
        return micromatch.any(str, blacklist);
    }
    return true;
}, { primitive: true });

async function main() {
    let genparams: GenParams | undefined;
    if (programArgs.code) {
        console.log("Reading prepared mod config.")
        genparams = deserializeGenParams(programArgs.code);
        console.log("Read params.")
    } else {
        const res = await prompt([{
            type: 'input',
            name: 'genparams',
            message: 'Enter a config code if you have it here, otherwise just press enter:'
        }]) as any
        if (res.genparams) {
            genparams = deserializeGenParams(res.genparams);
        }
    }
    let chosenGame
    if (!genparams) {
        const possibleGames = ['hoi4', 'ck3', 'eu4', 'stellaris','imperator']
        chosenGame = await new Select({
            name: 'game',
            message: 'Select a game to perfectly balance:',
            choices: possibleGames
        }).run();
    } else {
        chosenGame = genparams.chosenGame
    }
    const gameConfig = require('../games/' + chosenGame + '.json') as GameSettings;

    const gamepath = await getSteamGamePath(gameConfig.gamePathName);
    const documentsFolder = pathlib.join(os.homedir(), '/Documents/Paradox Interactive')


    const gamePathName: string = gameConfig.gamePathName
    const gameDocuments = pathlib.join(documentsFolder, gamePathName)
    const blacklist: string[] = gameConfig.modifierBlacklist


    const mods = await getModlist(gameDocuments);
    const modObj = _.zipObject(mods.map(x => x.name), mods) as {}
    if (!genparams) {
        const selectedIncludeDirs = await multiSelect("Select game features to be affected by balancing:", gameConfig.dirSets)

        const selectedBlacklists = await multiSelect("Select modifiers to be perfectly balanced:", gameConfig.optional, true);
        if (!fs.existsSync(pathlib.join(gameDocuments, 'mod'))) {
            console.log(`No data found at: '${gameDocuments}'`)
            console.log('Please try running again with --docPath specified or try running the game once before.');
            return;
        }
        //console.log(`Found game docs in ${gameDocuments}`)

        let selectedModNames = await multiSelect('Found the following mods, which would you like to enable?', modObj)
        const seed = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER / 2)

        const chance_01x= await numberInput('Enter the chance to NERF a modifier by 10x [0-100%]:',10)
        const chance_10x= await numberInput('Enter the chance to BUFF a modifier by 10x [0-100%]:',35)

        genparams = {
            chosenGame: chosenGame,
            includeDirs: selectedIncludeDirs,
            blacklistAdditions: selectedBlacklists,
            mods: selectedModNames,
            balancing:{
                seed,
                chance_01x,
                chance_10x
            }
        }
    }

    const selectedMods: Mod[] = selectionToValue(genparams.mods, modObj)
    const includeDirs = selectionToValue(genparams.includeDirs, gameConfig.dirSets)
    const blacklistAdditions = selectionToValue(genparams.blacklistAdditions, gameConfig.optional)
    blacklist.push(...blacklistAdditions)

    const rp = _.uniq(_.flatten(selectedMods.map(x => x.replacePaths)))

    let finalMod = pathlib.join(gameDocuments, `mod/${modName}`);
    fs.ensureDirSync(finalMod)
    fs.emptyDirSync(finalMod)
    const fileMap: { [key: string]: fullPath } = {}
    console.log("Enumerating files & performing copies...")
    for (const dir of includeDirs) {
        if (rp.indexOf(dir) !== -1) {
            continue;
        }
        const fullPath = pathlib.join(gamepath, dir)
        const allFiles = readDirFiles(fullPath,dir)
        for (const file of allFiles) {
            fileMap[file.relative] = file.fullpath
        }
    }
    for (const mod of selectedMods) {
        for (const dir of includeDirs) {
            const fullPath = pathlib.join(mod.value, dir);
            if (fs.existsSync(fullPath)) {
                const allFiles = readDirFiles(fullPath,dir)
                for (const file of allFiles) {
                    fileMap[file.relative] = file.fullpath
                }
            }
        }
        await fs.copy(mod.value, finalMod);//copy base mod over
    }
    const modifierRegex = /((?:cost|upkeep|build_cost_resources|modifier)\s*=\s*{[^}]*}|(\w*)\s*=\s*(\-?\d+[.,]\d+|\-?\d+)\s*?)/gim

    let debug_allprops: { [key: string]: string[] } = {}
    let debug_matchedProps: {
        [key: string]: {
            key: string,
            values: string[]
        }
    } = {}
    let debug_contents: string[] = [];
    console.log("Reading files...")
    const fileContents = await readAllFiles(Object.values(fileMap));
    const relativePaths = Object.keys(fileMap);
    const fileContentContent = Object.values(fileContents)

    console.log("Generating balance...")
    const balancer = createBalancer(BalancerType.periodical, genparams.balancing)
    const possibleValues: {[key: string]: number[]} = {}
    for (let i = 0; i < fileContentContent.length; i++) {
        let content = fileContentContent[i]
        content.replace(modifierRegex, ((match, p1, p2, p3, offset, string) => {
            if (!p2) return match;
            if (debug_allprops[p2] === undefined) {
                debug_allprops[p2] = []
            }
            debug_allprops[p2].push(p3);
            if (!isNaN(Number(p3)) && !mmAny(p2, blacklist)) {
                if (debug_matchedProps[p2] === undefined) {
                    debug_matchedProps[p2] = { key: p2, values: [] }
                }
                if (possibleValues[p2] === undefined) {
                    possibleValues[p2] = []
                }
                debug_matchedProps[p2].values.push(p3);
                possibleValues[p2].push(parseFloat(p3));
            }
            return match;
        }))
    }
    console.log("Finished initial parse.")
    for (let i = 0; i < fileContentContent.length; i++) {
        let content = fileContentContent[i]
        let pathRelative = relativePaths[i];
        let matchesAny = false;
        debug_contents.push(`##### ${pathRelative}\n\n\n` + content);
        content = content.replace(modifierRegex, ((match, p1, p2, p3, offset, string) => {
            if (!p2) return match;
            if (!isNaN(Number(p3)) && !mmAny(p2, blacklist)) {
                if(!debug_matchedProps[p2]){
                    return match;
                }
                matchesAny = true;
                /*const switcherooTarget = debug_matchedProps[p2]
                const anyDecimalValues = switcherooTarget.values.find(x=>x.indexOf('.') > -1) !== undefined;
                const onlyUnique = _.uniq(switcherooTarget.values);
                const noneDifferent = onlyUnique.length === 1;
                if(!anyDecimalValues && noneDifferent){
                    delete debug_matchedProps[p2];
                    return match;
                }*/
                return balancer.balance(pathRelative, p2, p3, possibleValues[p2]);
            } else {
                return match;
            }
        }))
        if (matchesAny) {
            let pathCleaned = pathRelative.replace(/^game[\\\/]common[\\\/]/igm,'common\\');
            let componentPath = pathlib.join(finalMod, pathCleaned)
            //console.log(`Component path will be written: ${componentPath}`)
            fs.mkdirpSync(pathlib.dirname(componentPath))
            fs.writeFileSync(componentPath, content, {
                encoding: 'utf8'
            })
        } else {
            //console.log('No usable modifiers found, skipping');
        }
    }
    writeDebug('props_all_' + chosenGame + '.csv', Object.keys(debug_allprops).map(x => x + ',' + debug_allprops[x].values).join('\n'))
    writeDebug('props_matched_' + chosenGame + '.csv', Object.keys(debug_matchedProps).map(x => x + ',' + debug_matchedProps[x].values).join('\n'))
    writeDebug('content_' + chosenGame + '.txt', debug_contents.join('\n\n\n\n\n\n'))

    const rpString = rp.map(x => `replace_path="${x}"`).join('\n')
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
    const hashData = await hashElement(finalMod,{
        encoding: 'hex',
        
    })
    const hash = hashData.hash
    writeDebug('allFiles.csv', balancer.getAll().join("\n"))
    writeDebug('interestingFiles.csv', balancer.getInteresting().join("\n"))
    console.log('')
    console.log('')
    console.log(`Wrote mod to ${finalMod}`)
    console.log("List of interesting touched files is available in the debug folder");
    console.log('')
    console.log(`To share this mod configuration, give this code to your friends:`);
    console.log(`${serializeGenParams(genparams)}`)
    console.log('')
    console.log("SHA1 HASH:  "+ hash)
    await (new Confirm({
        name: 'question',
        message: 'Press any key to close...'
    })).run()
}
main();