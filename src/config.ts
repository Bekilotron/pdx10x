import * as fs from 'fs-extra';
import * as pathlib from 'path';
import * as _ from 'lodash'
import * as os from 'os';
import * as yargs from 'yargs';
import { deserializeGenParams,  GameSettings,  GenParams, getModlist, getSteamGamePath, multiSelect, numberInput, selectionToValue,  } from './tools';
import { prompt } from 'enquirer';
const { Select } = require('enquirer');
const programArgs = yargs.option('code', {
    alias: 'c',
    type: 'string',
    description: 'A predefined mod config'
}).argv
export async function loadParams(): Promise<GenParams> {
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


    const gameConfig = getGameSettings(chosenGame);
    const gameDocumentsPath = pathlib.join(os.homedir(), '/Documents/Paradox Interactive/', gameConfig.gamePathName)

    const mods = await getModlist(gameDocumentsPath);
    const modObj = _.zipObject(mods.map(x => x.name), mods) as {}
    if (!genparams) {
        const selectedIncludeDirs = await multiSelect("Select game features to be affected by balancing:", gameConfig.dirSets)

        const selectedBlacklists = await multiSelect("Select modifiers to be perfectly balanced:", gameConfig.optional, true);
        if (!fs.existsSync(pathlib.join(gameDocumentsPath, 'mod'))) {
            console.log(`No data found at: '${gameDocumentsPath}'`)
            console.log('Please try running again with --docPath specified or try running the game once before.');
            process.exit(1);

        }
        //console.log(`Found game docs in ${gameDocuments}`)

        let selectedModNames = await multiSelect('Found the following mods, which would you like to enable?', modObj)
        const seed = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER / 2)
        console.log(`Seed for balancing: ${seed}`)

        const chance_01x= await numberInput('Enter the chance to NERF a modifier by 10x [0-100%]:',10)
        const chance_10x= await numberInput('Enter the chance to BUFF a modifier by 10x [0-100%]:',35)

        const blacklist = gameConfig.modifierBlacklist;
        const blacklistAdditions = selectionToValue(selectedBlacklists, gameConfig.optional)
        blacklist.push(...blacklistAdditions)   
        genparams = {
            chosenGame: chosenGame,
            includeDirs: selectionToValue(selectedIncludeDirs, gameConfig.dirSets),
            selectedMods: selectionToValue(selectedModNames, modObj),
            blacklist,
            jsonSettings: gameConfig,
            derived: {
                steamGamePath: await getSteamGamePath(gameConfig.gamePathName),
                gameDocumentsPath: gameDocumentsPath,imported:false
            },
            balancing:{
                seed,
                chance_01x,
                chance_10x
            }
        }
    }else{
        genparams.derived =  {
            steamGamePath: await getSteamGamePath(gameConfig.gamePathName),
            gameDocumentsPath: gameDocumentsPath,
            imported: true
        }
    }
    
    return genparams;
}
export  function getGameSettings(chosenGame: string): GameSettings{
    return require('../games/' + chosenGame + '.json') as GameSettings;
}