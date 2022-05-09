import * as fs from 'fs-extra';
import { promises as fsp } from 'fs'
import path, * as pathlib from 'path';
import * as _ from 'lodash'
const { MultiSelect } = require('enquirer');
import { prompt } from 'enquirer';
import zlib from "zlib";
import { number } from 'yargs';
export interface ModFileLine {
    key: string;
    value: string;
}
export interface GameSettings{
    gamePathName: string,
    modifierBlacklist: string[],
    optional: {[key: string]:string[]}
    dirSets:  {[key: string]:string[]},
    
}
export type fullPath = string
export async function readAllFiles(paths: string[]): Promise<{ [key: string]: string }> {
    let arr = paths.map(x => {
        return fsp.readFile(x, 'utf8')
    })
    const data = await Promise.all(arr)
    let ret: { [key: string]: string } = {};
    for (let i = 0; i < data.length; i++) {
        ret[paths[i]] = data[i];
    }
    return ret;
}
export interface Mod {
    name: string;
    value: string;
    replacePaths: string[]
}
export function readModfile(mf: string): ModFileLine[]{
    const re = /(^[^=]*)=("[^"]*"|{[^}]*})/igm
    let m;
    const mfl: ModFileLine[] = []
    while(m = re.exec(mf)){
        mfl.push({
            key: m[1],
            value: m[2].replace(/^"([^]*)"$/,'$1')
        })
    }
    return mfl
}
export async function getModlist(gameDocumentsFolder: string): Promise<Mod[]> {
    const modDocuments = pathlib.join(gameDocumentsFolder, '/mod')
    let files = fs.readdirSync(modDocuments).filter(x => x.startsWith('ugc_'));
    const mods: Mod[] = [];
    const modfileContent = await readAllFiles(files.map(x => pathlib.join(modDocuments, x)))
    for (const mod of Object.values(modfileContent)) {
        const modfile = readModfile(mod)
        let path = modfile.find(x=>x.key === 'path');
        if(!path) continue;
        const contentPath = path.value
        const modName = modfile.find(x=>x.key === 'name')!.value
        mods.push({
            name: modName,
            value: contentPath,
            replacePaths: modfile.filter(x=>x.key === 'replace_path').map(x=>x.value)
        })

    }
    return mods
}
export async function writeDebug(fileName: string, data: string){
    if(!fs.existsSync('debug')){
        fs.mkdirSync('debug')
    }
    fs.writeFileSync(pathlib.join('debug/',fileName),data);
}
export function readDirFiles(abs: string,relative: string): {relative:string, fullpath: string}[]{
    if(!fs.existsSync(abs)){
        return [];
    }
    const fmt = (file: string)=>{
        return {
            relative: pathlib.join(relative,file),
            fullpath: pathlib.join(abs,file)
        }
    }
    if(fs.statSync(abs).isFile()){
        return [fmt('')];
    }
    return fs.readdirSync(abs,{withFileTypes: true}).filter(x=>{
        return x.isFile()
    }).map(x=>fmt(x.name));
}
export async function numberInput(userPrompt: string, defaultValue: number): Promise<number>{
    let res: {value: number} = await prompt({
        type: 'numeral',
        message: userPrompt,
        'initial':defaultValue,
        min: 0,
        max: 100,
        float: false,
        'name':'value'
    })
    return res.value;
}
export async function multiSelect<T>(userPrompt: string,choices: {[key: string]: string[]},invert=false){
    let choiceArray = Object.keys(choices);
    if(choiceArray.length === 0) return []
    const prompt = new MultiSelect({
        name: "value",
        message: userPrompt,
        choices:choiceArray
    })

    let ans:string[] = await prompt.run();
    let selected: string[] = []
    for(const choice of Object.keys(choices)){
        const contained = ans.indexOf(choice) > -1;
        if(contained && !invert){
            selected.push(choice)
        }
        if(!contained && invert){
            selected.push(choice)
        }
    }
    return selected;
}
export  function selectionToValue<T>(selection: string[],values: {[key: string]: T[]}): T[]{
    let ret:T[][] = []
    for(const key of Object.keys(values)){
        if(selection.indexOf(key) > -1){
            ret.push(values[key]);
        }
    }
    return _.flatten(ret);
}
export interface BalancerOptions{
    seed: number,
    chance_10x: number,
    chance_01x: number
}
export interface GenParams {
    chosenGame: string,
    includeDirs: string[],
    blacklistAdditions: string[],
    mods: string[],
    balancing: BalancerOptions
}
export function serializeGenParams(gp: GenParams){
    return zlib.gzipSync(JSON.stringify(gp)).toString('hex')
}
export function deserializeGenParams(gpS: string): GenParams{
    let buf = Buffer.from(gpS,'hex');
    let unzip = zlib.gunzipSync(buf).toString('utf8');
    return JSON.parse(unzip);
}
export function getSteamGamePath(gameName: string): Promise<string>{
    return new Promise(async (res,rej)=>{
        const query = await prompt([{
            type: 'input',
            name: 'data',
            message: 'Enter the path to steamapps/common, or just press enter for default:'
        }]) as any
        let path = "C:\\Program Files (x86)\\Steam\\steamapps\\common"
        if(query.data){
            path = (query.data);
        }
        if(gameName === 'Imperator'){
            gameName = 'ImperatorRome'//???
        }
        return res(pathlib.join(path,gameName))
        /*regedit.list('HKCU\\SOFTWARE\\Valve\\Steam',(err: any,result: any)=>{
            if(err){
                rej(err);
            }
            let steamPath = result['HKCU\\SOFTWARE\\Valve\\Steam'].values.SteamPath.value
            res(pathlib.join(steamPath,'steamapps/common/',gameName));
        });*/
    })
}